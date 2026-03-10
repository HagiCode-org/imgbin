import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetWriter } from '../services/asset-writer.js';
import { JobRunner } from '../services/job-runner.js';
import { MetadataService } from '../services/metadata.js';
import { ThumbnailService } from '../services/thumbnail.js';
import { createTempDir, FakeImageProvider, FakeVisionProvider } from './helpers.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function createRunner(options: {
  imageProvider?: FakeImageProvider;
  visionProvider?: FakeVisionProvider;
  now?: Date;
}) {
  return new JobRunner({
    imageProvider: options.imageProvider,
    visionProvider: options.visionProvider,
    assetWriter: new AssetWriter(),
    metadataService: new MetadataService(),
    thumbnailService: new ThumbnailService(),
    thumbnailConfig: {
      size: 64,
      format: 'webp',
      quality: 80
    },
    now: () => options.now ?? new Date('2026-03-10T00:00:00.000Z')
  });
}

describe('integration flows', () => {
  it('generates an asset, metadata, and thumbnail', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const runner = createRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider()
    });

    const result = await runner.generate({
      prompt: 'orange dashboard hero',
      output: dir,
      tags: ['dashboard', 'hero'],
      annotate: true,
      thumbnail: true,
      dryRun: false
    });

    expect(result.success).toBe(true);
    expect(result.assetDir).toBeTruthy();

    const metadataPath = path.join(result.assetDir!, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as { title: string; tags: string[]; paths: { thumbnail?: string }; status: { recognition: string; thumbnail: string } };

    expect(metadata.title).toBe('Recognized Sunset Panel');
    expect(metadata.tags).toEqual(['sunset', 'panel', 'ui']);
    expect(metadata.paths.thumbnail).toBe('thumbnail.webp');
    expect(metadata.status.recognition).toBe('succeeded');
    expect(metadata.status.thumbnail).toBe('succeeded');
  });

  it('preserves manual metadata when annotate runs later', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const metadataService = new MetadataService();
    const runner = new JobRunner({
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider(),
      assetWriter: new AssetWriter(),
      metadataService,
      thumbnailService: new ThumbnailService(),
      thumbnailConfig: {
        size: 64,
        format: 'webp',
        quality: 80
      },
      now: () => new Date('2026-03-10T00:00:00.000Z')
    });

    const generated = await runner.generate({
      prompt: 'manual hero',
      output: dir,
      tags: [],
      annotate: false,
      thumbnail: false,
      dryRun: false
    });

    const assetDir = generated.assetDir!;
    const metadata = await metadataService.load(assetDir);
    metadata.manual = {
      title: 'Manual Title',
      tags: ['manual-tag']
    };
    await metadataService.save(assetDir, metadata);

    const annotated = await runner.annotate({
      assetPath: assetDir,
      overwrite: false,
      dryRun: false
    });

    expect(annotated.success).toBe(true);
    const updated = await metadataService.load(assetDir);
    expect(updated.title).toBe('Manual Title');
    expect(updated.tags).toEqual(['manual-tag']);
    expect(updated.recognized?.title).toBe('Recognized Sunset Panel');
  });

  it('keeps batch processing going when one job fails', async () => {
    const dir = await createTempDir();
    cleanupDirs.push(dir);
    const runner = createRunner({
      imageProvider: new FakeImageProvider({ failPrompts: new Set(['bad prompt']) }),
      visionProvider: new FakeVisionProvider()
    });

    const result = await runner.batch(
      [
        { prompt: 'good prompt', tags: ['ok'] },
        { prompt: 'bad prompt', tags: ['bad'] }
      ],
      dir,
      false
    );

    expect(result.success).toBe(false);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.some((item) => item.success)).toBe(true);
    expect(result.results.some((item) => !item.success)).toBe(true);
  });
});
