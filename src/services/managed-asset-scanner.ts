import path from 'node:path';
import { promises as fs, type Dirent } from 'node:fs';
import type { AssetMetadata } from '../types.js';
import { pathExists } from '../lib/paths.js';

export class ManagedAssetScanner {
  public async findPendingRecognitionAssets(libraryRoot: string): Promise<string[]> {
    const resolvedRoot = path.resolve(libraryRoot);
    const pending: string[] = [];

    await this.walk(resolvedRoot, pending);

    pending.sort();
    return pending;
  }

  private async walk(currentDir: string, pending: string[]): Promise<void> {
    const metadataPath = path.join(currentDir, 'metadata.json');
    if (await pathExists(metadataPath)) {
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as AssetMetadata;
        if (metadata.status?.recognition === 'pending' || metadata.status?.recognition === 'failed') {
          pending.push(currentDir);
        }
      } catch {
        // Ignore malformed metadata files during discovery so one bad asset does not block the batch.
      }
      return;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await this.walk(path.join(currentDir, entry.name), pending);
    }
  }
}
