import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import { describe, expect, it, vi } from 'vitest';
import type { CliRuntime } from '../lib/runtime.js';
import { buildCli, isExecutedAsScript, runCli } from '../cli.js';

function createRuntimeStub(): CliRuntime {
  return {
    cwd: process.cwd(),
    config: {
      outputDir: '/tmp/library',
      analysisPromptPath: '/tmp/default-analysis-prompt.txt',
      thumbnail: {
        size: 512,
        format: 'webp',
        quality: 82
      }
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    manifestLoader: {
      load: vi.fn(async () => ({ jobs: [] }))
    },
    searchService: {
      search: vi.fn(async () => ({
        success: true,
        query: 'orange hero',
        mode: 'exact',
        library: '/tmp/library',
        rebuilt: false,
        indexPath: '/tmp/library/.imgbin/search-index.json',
        indexedCount: 0,
        skippedCount: 0,
        totalMatches: 0,
        results: []
      }))
    },
    jobRunner: {
      generate: vi.fn(async () => ({ success: true, message: 'generated', steps: [] })),
      annotate: vi.fn(async () => ({ success: true, message: 'annotated', steps: [] })),
      thumbnail: vi.fn(async () => ({ success: true, message: 'thumbnailed', steps: [] })),
      batch: vi.fn(async () => ({ success: true, total: 0, succeeded: 0, failed: 0, results: [] }))
    }
  } as unknown as CliRuntime;
}

describe('CLI parsing', () => {
  it('maps generate flags into the job runner input', async () => {
    const runtime = createRuntimeStub();
    const cli = buildCli(runtime);

    await cli.parseAsync([
      'node',
      'imgbin',
      'generate',
      '--prompt-file',
      './prompt.json',
      '--output',
      './out',
      '--slug',
      'orange-dashboard',
      '--tag',
      'dashboard',
      '--tag',
      'hero',
      '--annotate',
      '--thumbnail',
      '--analysis-prompt',
      './analysis.txt',
      '--analysis-context',
      'dashboard roster editor'
    ]);

    expect(runtime.jobRunner.generate).toHaveBeenCalledWith({
      prompt: undefined,
      promptFile: './prompt.json',
      output: './out',
      slug: 'orange-dashboard',
      title: undefined,
      tags: ['dashboard', 'hero'],
      annotate: true,
      thumbnail: true,
      dryRun: false,
      analysisPromptPath: './analysis.txt',
      analysisContext: 'dashboard roster editor',
      analysisContextFile: undefined
    });
  });

  it('maps annotate analysis context flags into the job runner input', async () => {
    const runtime = createRuntimeStub();
    const cli = buildCli(runtime);

    await cli.parseAsync([
      'node',
      'imgbin',
      'annotate',
      './asset.png',
      '--analysis-context-file',
      './context.txt',
      '--import-to',
      './library'
    ]);

    expect(runtime.jobRunner.annotate).toHaveBeenCalledWith({
      assetPath: './asset.png',
      overwrite: false,
      dryRun: false,
      importTo: './library',
      analysisPromptPath: undefined,
      analysisContext: undefined,
      analysisContextFile: './context.txt',
      slug: undefined,
      title: undefined,
      tags: [],
      thumbnail: false
    });
  });

  it('rejects annotated generation without analysis context', async () => {
    const runtime = createRuntimeStub();
    const cli = buildCli(runtime);

    await expect(
      cli.parseAsync(['node', 'imgbin', 'generate', '--prompt', 'hello', '--annotate'])
    ).rejects.toMatchObject<AppError>({
      message: 'Annotated generation requires --analysis-context or --analysis-context-file.'
    });
  });

  it('rejects annotate without analysis context', async () => {
    const runtime = createRuntimeStub();
    const cli = buildCli(runtime);

    await expect(cli.parseAsync(['node', 'imgbin', 'annotate', './asset.png'])).rejects.toMatchObject<AppError>({
      message: 'Image recognition requires --analysis-context or --analysis-context-file.'
    });
  });

  it('returns a non-zero exit code for AppError failures', async () => {
    const exitCode = await runCli(['node', 'imgbin', 'generate'], {
      cwd: process.cwd()
    });

    expect(exitCode).toBe(1);
  });

  it('maps search flags into the search service input', async () => {
    const runtime = createRuntimeStub();
    const cli = buildCli(runtime);

    await cli.parseAsync([
      'node',
      'imgbin',
      'search',
      '--library',
      './library',
      '--query',
      'orange hero',
      '--fuzzy',
      '--limit',
      '5',
      '--json',
      '--reindex'
    ]);

    expect(runtime.searchService.search).toHaveBeenCalledWith({
      library: './library',
      query: 'orange hero',
      mode: 'fuzzy',
      limit: 5,
      output: 'json',
      reindex: true
    });
  });

  it('treats a symlinked CLI entrypoint as the executed script', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imgbin-cli-test-'));
    const realScriptPath = path.join(tempDir, 'dist', 'cli.js');
    const linkPath = path.join(tempDir, 'node_modules', '@hagicode', 'imgbin', 'dist', 'cli.js');

    await fs.mkdir(path.dirname(realScriptPath), { recursive: true });
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.writeFile(realScriptPath, 'console.log("cli");\n', 'utf8');
    await fs.symlink(realScriptPath, linkPath);

    try {
      const result = await isExecutedAsScript(new URL(`file://${realScriptPath}`).href, linkPath);
      expect(result).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
