import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ManifestLoader } from '../services/manifest-loader.js';
import { createTempDir } from './helpers.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ManifestLoader', () => {
  it('resolves analysis context file paths relative to the manifest directory', async () => {
    const dir = await createTempDir('imgbin-manifest-');
    cleanupDirs.push(dir);
    const manifestPath = path.join(dir, 'jobs.yaml');
    const contextPath = path.join(dir, 'context.txt');
    await fs.writeFile(contextPath, 'context', 'utf8');
    await fs.writeFile(
      manifestPath,
      `
jobs:
  - assetPath: ./image.png
    importTo: ./library
    analysisContextFile: ./context.txt
`,
      'utf8'
    );

    const manifest = await new ManifestLoader().load(manifestPath);

    expect(manifest.jobs[0]?.analysisContextFile).toBe(contextPath);
    expect(manifest.jobs[0]?.assetPath).toBe(path.join(dir, 'image.png'));
  });
});
