import path from 'node:path';
import { promises as fs } from 'node:fs';
import YAML from 'yaml';
import type { BatchManifest } from '../types.js';
import { batchManifestSchema } from '../lib/schema.js';

export class ManifestLoader {
  public async load(manifestPath: string): Promise<BatchManifest> {
    const resolvedPath = path.resolve(manifestPath);
    const content = await fs.readFile(resolvedPath, 'utf8');
    const parsed = resolvedPath.endsWith('.json') ? JSON.parse(content) : YAML.parse(content);
    return batchManifestSchema.parse(parsed);
  }
}
