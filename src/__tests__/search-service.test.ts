import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MetadataService } from '../services/metadata.js';
import { SearchIndexService } from '../services/search-index.js';
import { SearchService } from '../services/search-service.js';
import { createTempDir } from './helpers.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('SearchIndexService and SearchService', () => {
  it('builds an index while skipping malformed metadata files', async () => {
    const dir = await createTempDir('imgbin-search-index-');
    cleanupDirs.push(dir);
    const metadataService = new MetadataService();
    const searchIndexService = new SearchIndexService(metadataService);

    await writeAsset(metadataService, dir, 'orange-dashboard-hero', {
      prompt: 'orange dashboard hero',
      tags: ['orange', 'hero']
    });

    const brokenDir = path.join(dir, '2026-03', 'broken-asset');
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, 'metadata.json'), '{not-json', 'utf8');

    const build = await searchIndexService.build(dir);

    expect(build.stats.scannedCount).toBe(2);
    expect(build.stats.indexedCount).toBe(1);
    expect(build.stats.skippedCount).toBe(1);
    expect(build.stats.skippedAssets[0]).toContain('broken-asset/metadata.json');
  });

  it('returns ranked exact matches with matched field attribution', async () => {
    const dir = await createTempDir('imgbin-search-exact-');
    cleanupDirs.push(dir);
    const metadataService = new MetadataService();
    const searchIndexService = new SearchIndexService(metadataService);
    const searchService = new SearchService(searchIndexService);

    await writeAsset(metadataService, dir, 'orange-dashboard-hero', {
      prompt: 'orange dashboard hero',
      tags: ['orange', 'hero']
    });
    await writeAsset(metadataService, dir, 'blue-docs-panel', {
      prompt: 'blue docs panel',
      tags: ['docs']
    });

    const result = await searchService.search({
      library: dir,
      query: 'orange hero',
      mode: 'exact',
      limit: 10,
      output: 'json',
      reindex: false
    });

    expect(result.rebuilt).toBe(true);
    expect(result.totalMatches).toBe(1);
    expect(result.results[0]?.slug).toBe('orange-dashboard-hero');
    expect(result.results[0]?.matchedFields).toContain('title');
    expect(result.results[0]?.matchedFields).toContain('tags');
  });

  it('returns fuzzy matches for near-miss queries without rebuilding a fresh index', async () => {
    const dir = await createTempDir('imgbin-search-fuzzy-');
    cleanupDirs.push(dir);
    const metadataService = new MetadataService();
    const searchIndexService = new SearchIndexService(metadataService);
    const searchService = new SearchService(searchIndexService);

    await writeAsset(metadataService, dir, 'launch-hero-banner', {
      prompt: 'launch hero banner',
      tags: ['launch', 'hero']
    });

    await searchService.search({
      library: dir,
      query: 'launch hero',
      mode: 'exact',
      limit: 10,
      output: 'json',
      reindex: false
    });

    const result = await searchService.search({
      library: dir,
      query: 'launc herp',
      mode: 'fuzzy',
      limit: 10,
      output: 'json',
      reindex: false
    });

    expect(result.rebuilt).toBe(false);
    expect(result.totalMatches).toBe(1);
    expect(result.results[0]?.slug).toBe('launch-hero-banner');
    expect(result.results[0]?.score).toBeGreaterThan(0.55);
  });
});

async function writeAsset(
  metadataService: MetadataService,
  libraryRoot: string,
  slug: string,
  options: { prompt: string; tags: string[] }
): Promise<void> {
  const assetDir = path.join(libraryRoot, '2026-03', slug);
  await fs.mkdir(assetDir, { recursive: true });
  const metadata = metadataService.createInitialMetadata({
    assetId: slug,
    slug,
    assetDir,
    originalFilename: 'original.png',
    prompt: options.prompt,
    tags: options.tags,
    createdAt: '2026-03-10T00:00:00.000Z'
  });
  await metadataService.save(assetDir, metadata);
}
