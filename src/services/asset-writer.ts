import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, resolveUniqueAssetDir } from '../lib/paths.js';
import { slugify } from '../lib/slug.js';

export interface CreateAssetDirectoryInput {
  outputRoot: string;
  slug?: string;
  prompt?: string;
  now: Date;
}

export class AssetWriter {
  public async createAssetDirectory(input: CreateAssetDirectoryInput): Promise<{ assetDir: string; slug: string; assetId: string }> {
    const slug = slugify(input.slug ?? input.prompt ?? 'asset');
    const assetDir = await resolveUniqueAssetDir(input.outputRoot, slug, input.now);
    await ensureDir(assetDir);
    return {
      assetDir,
      slug: path.basename(assetDir),
      assetId: path.basename(assetDir)
    };
  }

  public async writeOriginalAsset(assetDir: string, buffer: Buffer, mimeType: string): Promise<string> {
    const extension = extensionFromMimeType(mimeType);
    const filename = `original.${extension}`;
    await fs.writeFile(path.join(assetDir, filename), buffer);
    return filename;
  }

  public async readOriginalAsset(assetDir: string, originalFilename: string): Promise<Buffer> {
    return fs.readFile(path.join(assetDir, originalFilename));
  }
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}
