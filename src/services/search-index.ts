import path from 'node:path';
import { promises as fs, type Dirent } from 'node:fs';
import type { AssetMetadata, SearchIndexBuildResult, SearchIndexFile } from '../types.js';
import { ensureDir, pathExists } from '../lib/paths.js';
import { MetadataService } from './metadata.js';

const INDEX_VERSION = 1 as const;
const INDEX_DIRNAME = '.imgbin';
const INDEX_FILENAME = 'search-index.json';

export interface SearchIndexFreshness {
  fresh: boolean;
  reason?: string;
}

export class SearchIndexService {
  public constructor(private readonly metadataService: MetadataService) {}

  public getIndexPath(libraryRoot: string): string {
    return path.join(path.resolve(libraryRoot), INDEX_DIRNAME, INDEX_FILENAME);
  }

  public async load(libraryRoot: string): Promise<SearchIndexFile | undefined> {
    const indexPath = this.getIndexPath(libraryRoot);

    try {
      const raw = await fs.readFile(indexPath, 'utf8');
      const parsed = JSON.parse(raw) as SearchIndexFile;
      if (parsed.version !== INDEX_VERSION) {
        return undefined;
      }

      return {
        ...parsed,
        libraryRoot: path.resolve(parsed.libraryRoot),
        documents: [...parsed.documents].sort((left, right) => left.assetDir.localeCompare(right.assetDir))
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined;
      }

      return undefined;
    }
  }

  public async build(libraryRoot: string): Promise<SearchIndexBuildResult> {
    const resolvedRoot = path.resolve(libraryRoot);
    const metadataPaths = await this.findMetadataFiles(resolvedRoot);
    const fingerprints = await this.collectFingerprints(metadataPaths);
    const documents = [];
    const skippedAssets: string[] = [];

    for (const metadataPath of metadataPaths) {
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as AssetMetadata;
        documents.push(this.metadataService.toSearchDocument(metadata));
      } catch {
        skippedAssets.push(metadataPath);
      }
    }

    documents.sort((left, right) => left.assetDir.localeCompare(right.assetDir));

    return {
      index: {
        version: INDEX_VERSION,
        libraryRoot: resolvedRoot,
        generatedAt: new Date().toISOString(),
        indexedCount: documents.length,
        skippedCount: skippedAssets.length,
        sourceFingerprints: fingerprints,
        documents
      },
      stats: {
        scannedCount: metadataPaths.length,
        indexedCount: documents.length,
        skippedCount: skippedAssets.length,
        skippedAssets
      }
    };
  }

  public async save(libraryRoot: string, index: SearchIndexFile): Promise<string> {
    const indexPath = this.getIndexPath(libraryRoot);
    await ensureDir(path.dirname(indexPath));
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    return indexPath;
  }

  public async isFresh(index: SearchIndexFile): Promise<SearchIndexFreshness> {
    if (index.version !== INDEX_VERSION) {
      return {
        fresh: false,
        reason: 'Search index version changed.'
      };
    }

    const metadataPaths = await this.findMetadataFiles(index.libraryRoot);
    const currentFingerprints = await this.collectFingerprints(metadataPaths);
    const expectedPaths = Object.keys(index.sourceFingerprints).sort();
    const currentPaths = Object.keys(currentFingerprints).sort();

    if (expectedPaths.length !== currentPaths.length) {
      return {
        fresh: false,
        reason: 'Managed library contents changed.'
      };
    }

    for (const metadataPath of currentPaths) {
      if (index.sourceFingerprints[metadataPath] !== currentFingerprints[metadataPath]) {
        return {
          fresh: false,
          reason: 'Managed metadata changed since the index was built.'
        };
      }
    }

    return {
      fresh: true
    };
  }

  public async syncAsset(libraryRoot: string, assetDir: string): Promise<void> {
    const index = await this.load(libraryRoot);
    if (!index) {
      return;
    }

    const metadataPath = path.join(assetDir, 'metadata.json');
    const nextDocuments = index.documents.filter((document) => document.assetDir !== assetDir);
    const nextFingerprints = { ...index.sourceFingerprints };

    if (await pathExists(metadataPath)) {
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as AssetMetadata;
        nextDocuments.push(this.metadataService.toSearchDocument(metadata));
        nextFingerprints[metadataPath] = await this.fingerprint(metadataPath);
      } catch {
        delete nextFingerprints[metadataPath];
      }
    } else {
      delete nextFingerprints[metadataPath];
    }

    nextDocuments.sort((left, right) => left.assetDir.localeCompare(right.assetDir));

    await this.save(libraryRoot, {
      ...index,
      generatedAt: new Date().toISOString(),
      indexedCount: nextDocuments.length,
      documents: nextDocuments,
      sourceFingerprints: nextFingerprints
    });
  }

  public async findMetadataFiles(libraryRoot: string): Promise<string[]> {
    const resolvedRoot = path.resolve(libraryRoot);
    const metadataPaths: string[] = [];
    await this.walk(resolvedRoot, metadataPaths);
    metadataPaths.sort();
    return metadataPaths;
  }

  private async walk(currentDir: string, metadataPaths: string[]): Promise<void> {
    const metadataPath = path.join(currentDir, 'metadata.json');
    if (await pathExists(metadataPath)) {
      metadataPaths.push(metadataPath);
      return;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === INDEX_DIRNAME) {
        continue;
      }

      await this.walk(path.join(currentDir, entry.name), metadataPaths);
    }
  }

  private async collectFingerprints(metadataPaths: string[]): Promise<Record<string, string>> {
    const fingerprints: Record<string, string> = {};

    for (const metadataPath of metadataPaths) {
      fingerprints[metadataPath] = await this.fingerprint(metadataPath);
    }

    return fingerprints;
  }

  private async fingerprint(metadataPath: string): Promise<string> {
    const stats = await fs.stat(metadataPath);
    return `${stats.size}:${stats.mtimeMs}`;
  }
}

export function deriveLibraryRootFromAssetDir(assetDir: string): string {
  return path.resolve(assetDir, '..', '..');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
