import path from 'node:path';
import { promises as fs } from 'node:fs';
import YAML from 'yaml';
import type { BatchJobDefinition, BatchManifest } from '../types.js';
import { batchManifestSchema } from '../lib/schema.js';

export class ManifestLoader {
  public async load(manifestPath: string): Promise<BatchManifest> {
    const resolvedPath = path.resolve(manifestPath);
    const manifestDir = path.dirname(resolvedPath);
    const content = await fs.readFile(resolvedPath, 'utf8');
    const parsed = resolvedPath.endsWith('.json') ? JSON.parse(content) : YAML.parse(content);
    const manifest = batchManifestSchema.parse(parsed);

    return {
      jobs: manifest.jobs.map((job) => this.resolveJobPaths(job, manifestDir))
    };
  }

  private resolveJobPaths(job: BatchJobDefinition, manifestDir: string): BatchJobDefinition {
    return {
      ...job,
      promptFile: this.resolveOptionalPath(job.promptFile, manifestDir),
      output: this.resolveOptionalPath(job.output, manifestDir),
      assetPath: this.resolveOptionalPath(job.assetPath, manifestDir),
      importTo: this.resolveOptionalPath(job.importTo, manifestDir),
      analysisPromptPath: this.resolveOptionalPath(job.analysisPromptPath, manifestDir),
      pendingLibrary: this.resolveOptionalPath(job.pendingLibrary, manifestDir)
    };
  }

  private resolveOptionalPath(value: string | undefined, baseDir: string): string | undefined {
    if (!value) {
      return undefined;
    }

    return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
  }
}
