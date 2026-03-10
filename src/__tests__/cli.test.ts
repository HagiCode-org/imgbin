import { describe, expect, it, vi } from 'vitest';
import type { CliRuntime } from '../lib/runtime.js';
import { buildCli, runCli } from '../cli.js';

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
      './analysis.txt'
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
      analysisPromptPath: './analysis.txt'
    });
  });

  it('returns a non-zero exit code for AppError failures', async () => {
    const exitCode = await runCli(['node', 'imgbin', 'generate'], {
      cwd: process.cwd()
    });

    expect(exitCode).toBe(1);
  });
});
