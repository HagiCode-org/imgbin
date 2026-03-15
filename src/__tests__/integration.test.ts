import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeMetadataProvider } from '../providers/claude-metadata-provider.js';
import { AssetWriter } from '../services/asset-writer.js';
import { JobRunner } from '../services/job-runner.js';
import { ManagedAssetScanner } from '../services/managed-asset-scanner.js';
import { MetadataService } from '../services/metadata.js';
import { PromptSourceLoader } from '../services/prompt-source-loader.js';
import { RecognitionValidator } from '../services/recognition-validator.js';
import { SearchIndexService } from '../services/search-index.js';
import { SearchService } from '../services/search-service.js';
import { ThumbnailService } from '../services/thumbnail.js';
import { createPngBuffer, createTempDir, FakeImageProvider, FakeVisionProvider } from './helpers.js';

const cleanupDirs: string[] = [];
const fixtureDir = path.resolve('src/__tests__/fixtures');
const defaultAnalysisPromptPath = path.resolve('prompts/default-analysis-prompt.txt');
const DEFAULT_ANALYSIS_CONTEXT = 'Test analysis context: treat the image as a managed UI/editor screenshot and stay grounded in visible evidence.';

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function createRunner(options: {
  imageProvider?: FakeImageProvider;
  visionProvider?: FakeVisionProvider | ClaudeMetadataProvider;
  now?: Date;
  defaultAnalysisPromptPath?: string;
}) {
  const metadataService = new MetadataService();
  return new JobRunner({
    imageProvider: options.imageProvider,
    visionProvider: options.visionProvider,
    assetWriter: new AssetWriter(),
    metadataService,
    recognitionValidator: new RecognitionValidator(),
    thumbnailService: new ThumbnailService(),
    promptSourceLoader: new PromptSourceLoader(),
    managedAssetScanner: new ManagedAssetScanner(),
    searchIndexService: new SearchIndexService(metadataService),
    defaultAnalysisPromptPath: options.defaultAnalysisPromptPath ?? defaultAnalysisPromptPath,
    thumbnailConfig: {
      size: 64,
      format: 'webp',
      quality: 80
    },
    now: () => options.now ?? new Date('2026-03-10T00:00:00.000Z')
  });
}

async function createRecordingClaudeProvider(recordedPromptPath: string): Promise<ClaudeMetadataProvider> {
  const binDir = await createTempDir('imgbin-claude-bin-');
  cleanupDirs.push(binDir);
  const scriptPath = path.join(binDir, 'fake-claude.mjs');
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
import { promises as fs } from 'node:fs';

const args = process.argv.slice(2);
const promptIndex = args.indexOf('-p');
const prompt = promptIndex >= 0 ? args[promptIndex + 1] ?? '' : '';
const outputPath = ${JSON.stringify(recordedPromptPath)};
await fs.writeFile(outputPath, prompt, 'utf8');

process.stdout.write(JSON.stringify({
  title: 'Recorded Claude Title',
  tags: ['recorded', 'claude'],
  description: 'Prompt recorder response.'
}));
`,
    'utf8'
  );
  await fs.chmod(scriptPath, 0o755);
  return new ClaudeMetadataProvider({
    executable: scriptPath,
    model: 'fake-claude-model',
    timeoutMs: 5_000
  });
}

describe('integration flows', () => {
  it('generates from a docs prompt file, writes metadata, and records prompt provenance', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Recognized Illustrated Dashboard Panel',
          tags: ['dashboard-ui', 'hero-illustration', 'editor-panel'],
          description: 'An illustrated dashboard hero layout with interface panels.',
          provider: 'claude-cli'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      promptFile: path.join(fixtureDir, 'docs-prompt.json'),
      output: dir,
      tags: ['dashboard', 'hero'],
      annotate: true,
      analysisContext: 'Documentation hero asset with dashboard cards and visible interface layout.',
      thumbnail: true,
      dryRun: false
    });

    expect(result.success).toBe(true);
    expect(result.assetDir).toBeTruthy();

    const metadataPath = path.join(result.assetDir!, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as {
      generated: { promptSource?: { type: string; path?: string } };
      recognized?: { promptPath?: string; promptId?: string };
      title: string;
      tags: string[];
      paths: { thumbnail?: string };
      status: { recognition: string; thumbnail: string };
    };

    expect(metadata.generated.promptSource?.type).toBe('docs-prompt-file');
    expect(metadata.generated.promptSource?.path).toContain('docs-prompt.json');
    expect(metadata.recognized?.promptPath).toBe(defaultAnalysisPromptPath);
    expect(metadata.recognized?.promptId).toBe('default-analysis-prompt.txt');
    expect(metadata.title).toBe('Recognized Illustrated Dashboard Panel');
    expect(metadata.tags).toEqual(['dashboard-ui', 'hero-illustration', 'editor-panel']);
    expect(metadata.paths.thumbnail).toBe('thumbnail.webp');
    expect(metadata.status.recognition).toBe('succeeded');
    expect(metadata.status.thumbnail).toBe('succeeded');
    expect(visionProvider.calls[0]?.prompt.toLowerCase()).toContain('return strict json');
    expect(visionProvider.calls[0]?.recognitionContext.selectedScene).toBe('illustration-mixed');
    expect(visionProvider.calls[0]?.filenameHint).toBe(path.basename(result.assetDir!));
    expect(visionProvider.calls[0]?.filenameHintSource).toBe('slug');
  });

  it('imports a standalone image before analysis and preserves manual metadata on later annotate runs', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'standalone.png');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const metadataService = new MetadataService();
    const visionProvider = new FakeVisionProvider();
    const runner = new JobRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider,
      assetWriter: new AssetWriter(),
      metadataService,
      recognitionValidator: new RecognitionValidator(),
      thumbnailService: new ThumbnailService(),
      promptSourceLoader: new PromptSourceLoader(),
      managedAssetScanner: new ManagedAssetScanner(),
      searchIndexService: new SearchIndexService(metadataService),
      defaultAnalysisPromptPath,
      thumbnailConfig: {
        size: 64,
        format: 'webp',
        quality: 80
      },
      now: () => new Date('2026-03-10T00:00:00.000Z')
    });

    const imported = await runner.annotate({
      assetPath: sourcePath,
      importTo: dir,
      overwrite: false,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      tags: ['imported']
    });

    expect(imported.success).toBe(true);
    expect(imported.assetDir).toBeTruthy();

    const metadata = await metadataService.load(imported.assetDir!);
    expect(metadata.source?.type).toBe('imported');
    expect(metadata.source?.originalPath).toBe(sourcePath);
    expect(visionProvider.calls[0]?.filenameHint).toBe('standalone.png');
    expect(visionProvider.calls[0]?.filenameHintSource).toBe('source.originalPath');
    metadata.manual = {
      title: 'Manual Title',
      tags: ['manual-tag']
    };
    await metadataService.save(imported.assetDir!, metadata);

    const annotated = await runner.annotate({
      assetPath: imported.assetDir!,
      overwrite: false,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT
    });

    expect(annotated.success).toBe(true);
    const updated = await metadataService.load(imported.assetDir!);
    expect(updated.title).toBe('Manual Title');
    expect(updated.tags).toEqual(['manual-tag']);
    expect(updated.recognized?.title).toBe('Recognized Sunset Panel');
  });

  it('scans pending assets in the library and retries analysis', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider();
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const generated = await runner.generate({
      prompt: 'needs later analysis',
      output: dir,
      tags: [],
      annotate: false,
      thumbnail: false,
      dryRun: false
    });

    const result = await runner.batch([{ pendingLibrary: dir, analysisContext: DEFAULT_ANALYSIS_CONTEXT }], dir, false);

    expect(generated.success).toBe(true);
    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(visionProvider.calls[0]?.filenameHint).toBe('needs-later-analysis');
    expect(visionProvider.calls[0]?.filenameHintSource).toBe('slug');
    const metadata = JSON.parse(await fs.readFile(path.join(generated.assetDir!, 'metadata.json'), 'utf8')) as { status: { recognition: string } };
    expect(metadata.status.recognition).toBe('succeeded');
  });

  it('keeps generated assets when analysis fails and reports per-step warnings', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider({ shouldFail: true })
    });

    const result = await runner.generate({
      prompt: 'warning prompt',
      output: dir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(false);
    expect(result.assetDir).toBeTruthy();
    expect(result.steps?.some((step) => step.step === 'recognition' && step.status === 'failed')).toBe(true);

    const metadata = JSON.parse(await fs.readFile(path.join(result.assetDir!, 'metadata.json'), 'utf8')) as { status: { recognition: string } };
    expect(metadata.status.recognition).toBe('failed');
  });

  it('supports overriding the bundled analysis prompt', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider();
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'custom prompt asset',
      output: dir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false,
      analysisPromptPath: path.join(fixtureDir, 'custom-analysis-prompt.txt')
    });

    expect(result.success).toBe(true);
    expect(visionProvider.calls[0]?.prompt).toContain('imported marketing image');
    expect(visionProvider.calls[0]?.promptMetadata.path).toContain('custom-analysis-prompt.txt');
  });

  it('preserves Chinese filename hints and analysis context for imported screenshots', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, '冒险团-副本管理.png');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Adventure Squad Dungeon Management Editor',
          tags: ['game-editor', 'fantasy-ui', 'roster-management'],
          description: 'A fantasy roster and dungeon management editor.',
          provider: 'codex-cli'
        }
      ]
    });
    const runner = createRunner({
      visionProvider
    });

    const result = await runner.annotate({
      assetPath: sourcePath,
      importTo: dir,
      overwrite: false,
      dryRun: false,
      analysisContext:
        '这是一个冒险团副本管理页面，重点识别副本配置、队伍编成、已分配英雄和右侧编辑器面板。'
    });

    expect(result.success).toBe(true);
    expect(visionProvider.calls[0]?.filenameHint).toBe('冒险团-副本管理.png');
    expect(visionProvider.calls[0]?.recognitionContext.selectedScene).toBe('game-editor');
    expect(visionProvider.calls[0]?.recognitionContext.analysisContext?.type).toBe('inline');
    expect(visionProvider.calls[0]?.prompt).toContain('Project or user supplied context (auxiliary only):');
    expect(visionProvider.calls[0]?.prompt).toContain('冒险团副本管理页面');
  });

  it('loads analysis context from file and records provenance metadata', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Adventure Squad Dungeon Management Editor',
          tags: ['game-editor', 'fantasy-ui', 'roster-management'],
          description: 'A fantasy roster and dungeon management editor.',
          provider: 'codex-cli'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'fantasy roster workspace screenshot',
      output: dir,
      tags: [],
      annotate: true,
      thumbnail: false,
      dryRun: false,
      analysisContextFile: path.join(fixtureDir, 'analysis-context.txt')
    });

    expect(result.success).toBe(true);
    const metadata = await new MetadataService().load(result.assetDir!);
    expect(visionProvider.calls[0]?.recognitionContext.analysisContext?.type).toBe('file');
    expect(visionProvider.calls[0]?.recognitionContext.analysisContext?.path).toContain('analysis-context.txt');
    expect(metadata.recognized?.provenance?.analysisContextType).toBe('file');
    expect(metadata.recognized?.provenance?.analysisContextPath).toContain('analysis-context.txt');
    expect(metadata.recognized?.provenance?.analysisContextPreview).toContain('冒险团副本管理页面');
  });

  it('builds an admin-ui scene profile for complex dashboard screenshots', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Admin Settings Dashboard',
          tags: ['admin-ui', 'settings-panel', 'dashboard'],
          description: 'A software admin dashboard with settings panels.',
          provider: 'claude-cli'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'admin settings dashboard screenshot',
      output: dir,
      tags: ['admin'],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(true);
    expect(visionProvider.calls[0]?.recognitionContext.selectedScene).toBe('admin-ui');
    expect(visionProvider.calls[0]?.prompt).toContain('Scene profile guidance: admin-ui');
  });

  it('preserves mixed illustration and UI semantics in the recognized metadata', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Team Editor With Character Illustration',
          tags: ['editor-ui', 'team-panel', 'character-illustration'],
          description: 'A game team editor with visible interface panels and character artwork.',
          provider: 'codex-cli'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'game editor panel with character illustration',
      output: dir,
      tags: ['editor'],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(true);
    const metadata = await new MetadataService().load(result.assetDir!);
    expect(metadata.recognized?.sceneType).toBe('illustration-mixed');
    expect(metadata.tags).toContain('editor-ui');
    expect(metadata.tags).toContain('character-illustration');
  });

  it('retries once with stricter constraints when UI drift validation fails', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Anime Princess',
          tags: ['anime-character', 'princess'],
          description: 'A fantasy princess portrait.',
          provider: 'codex-cli'
        },
        {
          title: 'Admin Settings Dashboard',
          tags: ['admin-ui', 'settings-panel', 'dashboard'],
          description: 'A settings dashboard for a software admin panel.',
          provider: 'codex-cli'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'admin settings dashboard',
      output: dir,
      tags: ['admin'],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(true);
    expect(visionProvider.calls).toHaveLength(2);
    expect(visionProvider.calls[1]?.recognitionContext.retry.mode).toBe('strict-retry');
    expect(visionProvider.calls[1]?.prompt).toContain('Stricter retry constraints:');
    const metadata = await new MetadataService().load(result.assetDir!);
    expect(metadata.recognized?.retryHistory).toHaveLength(1);
    expect(metadata.recognized?.validation?.accepted).toBe(true);
    expect(metadata.recognized?.provider).toBe('codex-cli');
  });

  it('records validation failures distinctly when retry still cannot recover', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider({
      responses: [
        {
          title: 'Anime Princess',
          tags: ['anime-character', 'princess'],
          description: 'A fantasy princess portrait.',
          provider: 'http-vision-api'
        },
        {
          title: 'Anime Princess Deluxe Edition',
          tags: ['anime-character', 'princess'],
          description: 'Another fantasy character portrait.',
          provider: 'http-vision-api'
        }
      ]
    });
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      prompt: 'admin settings dashboard',
      output: dir,
      tags: ['admin'],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(false);
    expect(result.steps?.find((step) => step.step === 'recognition')?.message).toBe('Metadata analysis failed validation');
    const metadata = await new MetadataService().load(result.assetDir!);
    expect(metadata.status.recognition).toBe('failed');
    expect(metadata.recognized?.lastErrorKind).toBe('validation');
    expect(metadata.recognized?.retryHistory).toHaveLength(2);
  });

  it('includes imported source filenames in the final Claude request', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'launch-hero.png');
    const recordedPromptPath = path.join(dir, 'claude-imported-prompt.txt');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const runner = createRunner({
      visionProvider: await createRecordingClaudeProvider(recordedPromptPath)
    });

    const result = await runner.annotate({
      assetPath: sourcePath,
      importTo: dir,
      overwrite: false,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT
    });

    expect(result.success).toBe(true);
    const recordedPrompt = await fs.readFile(recordedPromptPath, 'utf8');
    expect(recordedPrompt).toContain('Filename guidance (soft scene hint):');
    expect(recordedPrompt).toContain('launch-hero.png');
    expect(recordedPrompt).toContain('imported source filename');
    expect(recordedPrompt).toContain('trust the image');
  });

  it('falls back to the managed slug in the final Claude request when no source filename exists', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const recordedPromptPath = path.join(dir, 'claude-generated-prompt.txt');

    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: await createRecordingClaudeProvider(recordedPromptPath)
    });

    const result = await runner.generate({
      prompt: 'orange dashboard hero',
      output: dir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(true);
    const recordedPrompt = await fs.readFile(recordedPromptPath, 'utf8');
    expect(recordedPrompt).toContain('Filename guidance (soft scene hint):');
    expect(recordedPrompt).toContain('orange-dashboard-hero');
    expect(recordedPrompt).toContain('managed asset slug');
  });

  it('filters placeholder filename hints out of the final Claude request', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'original.png');
    const recordedPromptPath = path.join(dir, 'claude-placeholder-prompt.txt');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const runner = createRunner({
      visionProvider: await createRecordingClaudeProvider(recordedPromptPath)
    });

    const result = await runner.annotate({
      assetPath: sourcePath,
      importTo: dir,
      slug: 'asset',
      overwrite: false,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT
    });

    expect(result.success).toBe(true);
    const recordedPrompt = await fs.readFile(recordedPromptPath, 'utf8');
    expect(recordedPrompt).not.toContain('Filename guidance (soft scene hint):');
    expect(recordedPrompt).not.toContain('Candidate hint from');
  });

  it('keeps runtime filename guidance when using a custom analysis prompt', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const recordedPromptPath = path.join(dir, 'claude-custom-prompt.txt');

    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: await createRecordingClaudeProvider(recordedPromptPath)
    });

    const result = await runner.generate({
      prompt: 'custom prompt asset',
      output: dir,
      slug: 'marketing-hero',
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false,
      analysisPromptPath: path.join(fixtureDir, 'custom-analysis-prompt.txt')
    });

    expect(result.success).toBe(true);
    const recordedPrompt = await fs.readFile(recordedPromptPath, 'utf8');
    expect(recordedPrompt).toContain('imported marketing image');
    expect(recordedPrompt).toContain('Filename guidance (soft scene hint):');
    expect(recordedPrompt).toContain('marketing-hero');
    expect(recordedPrompt).toContain('managed asset slug');
  });

  it('searches generated and imported assets through the persisted library index', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-search-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'launch-hero.png');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const metadataService = new MetadataService();
    const searchIndexService = new SearchIndexService(metadataService);
    const runner = new JobRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider(),
      assetWriter: new AssetWriter(),
      metadataService,
      recognitionValidator: new RecognitionValidator(),
      thumbnailService: new ThumbnailService(),
      promptSourceLoader: new PromptSourceLoader(),
      managedAssetScanner: new ManagedAssetScanner(),
      searchIndexService,
      defaultAnalysisPromptPath,
      thumbnailConfig: {
        size: 64,
        format: 'webp',
        quality: 80
      },
      now: () => new Date('2026-03-10T00:00:00.000Z')
    });
    const searchService = new SearchService(searchIndexService);

    const generated = await runner.generate({
      prompt: 'orange dashboard hero',
      output: dir,
      tags: ['hero', 'dashboard'],
      annotate: false,
      thumbnail: false,
      dryRun: false
    });
    const imported = await runner.annotate({
      assetPath: sourcePath,
      importTo: dir,
      overwrite: false,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      tags: ['launch']
    });

    expect(generated.success).toBe(true);
    expect(imported.success).toBe(true);

    const exact = await searchService.search({
      library: dir,
      query: 'orange hero',
      mode: 'exact',
      limit: 10,
      output: 'json',
      reindex: false
    });

    expect(exact.rebuilt).toBe(true);
    expect(exact.results[0]?.slug).toContain('orange-dashboard-hero');
    expect(exact.results[0]?.matchedFields).toContain('title');

    const fuzzy = await searchService.search({
      library: dir,
      query: 'orng herp',
      mode: 'fuzzy',
      limit: 10,
      output: 'json',
      reindex: false
    });

    expect(fuzzy.rebuilt).toBe(false);
    expect(fuzzy.results.some((item) => item.slug.includes('orange-dashboard-hero'))).toBe(true);
    expect(fuzzy.indexedCount).toBeGreaterThanOrEqual(2);
  });

  it('supports provider switching on the same asset while keeping provenance readable', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);

    const firstRunner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider({
        responses: [
          {
            title: 'Dashboard Overview',
            tags: ['dashboard', 'panel', 'ui'],
            description: 'A dashboard overview.',
            provider: 'claude-cli'
          }
        ]
      })
    });

    const generated = await firstRunner.generate({
      prompt: 'product dashboard screenshot',
      output: dir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    const secondRunner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider({
        responses: [
          {
            title: 'Dashboard Settings Panel',
            tags: ['admin-ui', 'settings-panel', 'dashboard'],
            description: 'A provider-switched admin settings dashboard.',
            provider: 'http-vision-api'
          }
        ]
      })
    });

    const updated = await secondRunner.annotate({
      assetPath: generated.assetDir!,
      overwrite: true,
      dryRun: false,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT
    });

    expect(updated.success).toBe(true);
    const metadata = await new MetadataService().load(generated.assetDir!);
    expect(metadata.recognized?.provider).toBe('http-vision-api');
    expect(metadata.recognized?.provenance?.providerId).toBe('http');
    expect(metadata.recognized?.title).toBe('Dashboard Settings Panel');
  });
});
