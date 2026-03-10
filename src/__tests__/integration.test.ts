import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetWriter } from '../services/asset-writer.js';
import { JobRunner } from '../services/job-runner.js';
import { ManagedAssetScanner } from '../services/managed-asset-scanner.js';
import { MetadataService } from '../services/metadata.js';
import { PromptSourceLoader } from '../services/prompt-source-loader.js';
import { ThumbnailService } from '../services/thumbnail.js';
import { createPngBuffer, createTempDir, FakeImageProvider, FakeVisionProvider } from './helpers.js';

const cleanupDirs: string[] = [];
const fixtureDir = path.resolve('src/__tests__/fixtures');
const defaultAnalysisPromptPath = path.resolve('prompts/default-analysis-prompt.txt');

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function createRunner(options: {
  imageProvider?: FakeImageProvider;
  visionProvider?: FakeVisionProvider;
  now?: Date;
  defaultAnalysisPromptPath?: string;
}) {
  return new JobRunner({
    imageProvider: options.imageProvider,
    visionProvider: options.visionProvider,
    assetWriter: new AssetWriter(),
    metadataService: new MetadataService(),
    thumbnailService: new ThumbnailService(),
    promptSourceLoader: new PromptSourceLoader(),
    managedAssetScanner: new ManagedAssetScanner(),
    defaultAnalysisPromptPath: options.defaultAnalysisPromptPath ?? defaultAnalysisPromptPath,
    thumbnailConfig: {
      size: 64,
      format: 'webp',
      quality: 80
    },
    now: () => options.now ?? new Date('2026-03-10T00:00:00.000Z')
  });
}

describe('integration flows', () => {
  it('generates from a docs prompt file, writes metadata, and records prompt provenance', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const visionProvider = new FakeVisionProvider();
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider
    });

    const result = await runner.generate({
      promptFile: path.join(fixtureDir, 'docs-prompt.json'),
      output: dir,
      tags: ['dashboard', 'hero'],
      annotate: true,
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
    expect(metadata.title).toBe('Recognized Sunset Panel');
    expect(metadata.tags).toEqual(['sunset', 'panel', 'ui']);
    expect(metadata.paths.thumbnail).toBe('thumbnail.webp');
    expect(metadata.status.recognition).toBe('succeeded');
    expect(metadata.status.thumbnail).toBe('succeeded');
    expect(visionProvider.calls[0]?.prompt.toLowerCase()).toContain('return strict json');
  });

  it('imports a standalone image before analysis and preserves manual metadata on later annotate runs', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const sourceDir = await createTempDir('imgbin-source-');
    cleanupDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'standalone.png');
    await fs.writeFile(sourcePath, await createPngBuffer());

    const metadataService = new MetadataService();
    const runner = new JobRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider(),
      assetWriter: new AssetWriter(),
      metadataService,
      thumbnailService: new ThumbnailService(),
      promptSourceLoader: new PromptSourceLoader(),
      managedAssetScanner: new ManagedAssetScanner(),
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
      tags: ['imported']
    });

    expect(imported.success).toBe(true);
    expect(imported.assetDir).toBeTruthy();

    const metadata = await metadataService.load(imported.assetDir!);
    expect(metadata.source?.type).toBe('imported');
    expect(metadata.source?.originalPath).toBe(sourcePath);
    metadata.manual = {
      title: 'Manual Title',
      tags: ['manual-tag']
    };
    await metadataService.save(imported.assetDir!, metadata);

    const annotated = await runner.annotate({
      assetPath: imported.assetDir!,
      overwrite: false,
      dryRun: false
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
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider()
    });

    const generated = await runner.generate({
      prompt: 'needs later analysis',
      output: dir,
      tags: [],
      annotate: false,
      thumbnail: false,
      dryRun: false
    });

    const result = await runner.batch([{ pendingLibrary: dir }], dir, false);

    expect(generated.success).toBe(true);
    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
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
      thumbnail: false,
      dryRun: false,
      analysisPromptPath: path.join(fixtureDir, 'custom-analysis-prompt.txt')
    });

    expect(result.success).toBe(true);
    expect(visionProvider.calls[0]?.prompt).toContain('imported marketing image');
    expect(visionProvider.calls[0]?.promptMetadata.path).toContain('custom-analysis-prompt.txt');
  });
});
