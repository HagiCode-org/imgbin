import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import type {
  AnnotateCommandInput,
  AssetMetadata,
  BatchCommandResult,
  BatchJobDefinition,
  CommandResult,
  GenerateCommandInput,
  ImageGenerationProvider,
  ThumbnailCommandInput,
  VisionRecognitionProvider
} from '../types.js';
import { AssetWriter } from './asset-writer.js';
import { MetadataService } from './metadata.js';
import { ThumbnailService } from './thumbnail.js';

export interface JobRunnerDependencies {
  imageProvider?: ImageGenerationProvider;
  visionProvider?: VisionRecognitionProvider;
  assetWriter: AssetWriter;
  metadataService: MetadataService;
  thumbnailService: ThumbnailService;
  thumbnailConfig: {
    size: number;
    format: 'webp' | 'png' | 'jpeg';
    quality: number;
  };
  now: () => Date;
}

export class JobRunner {
  public constructor(private readonly deps: JobRunnerDependencies) {}

  public async generate(input: GenerateCommandInput): Promise<CommandResult> {
    if (input.dryRun) {
      return {
        success: true,
        message: `[dry-run] generate ${input.prompt}`
      };
    }

    if (!this.deps.imageProvider) {
      throw new AppError('Image generation provider is not configured.', 2);
    }

    const now = this.deps.now();
    const generation = await this.deps.imageProvider.createImage({
      prompt: input.prompt,
      tags: input.tags
    });

    const { assetDir, assetId, slug } = await this.deps.assetWriter.createAssetDirectory({
      outputRoot: input.output,
      slug: input.slug,
      prompt: input.prompt,
      now
    });

    const originalFilename = await this.deps.assetWriter.writeOriginalAsset(assetDir, generation.buffer, generation.mimeType);
    let metadata = this.deps.metadataService.createInitialMetadata({
      assetId,
      slug,
      assetDir,
      originalFilename,
      prompt: input.prompt,
      title: input.title,
      tags: input.tags,
      generatedProvider: generation.provider,
      generatedModel: generation.model,
      createdAt: now.toISOString(),
      providerPayload: {
        image: generation.raw
      }
    });

    let recognitionError: string | undefined;
    if (input.annotate) {
      const recognitionResult = await this.applyRecognition(assetDir, metadata, false);
      metadata = recognitionResult.metadata;
      recognitionError = recognitionResult.error;
    } else {
      metadata = {
        ...metadata,
        status: {
          ...metadata.status,
          recognition: 'skipped'
        }
      };
    }

    let thumbnailError: string | undefined;
    if (input.thumbnail) {
      const thumbnailResult = await this.applyThumbnail(assetDir, metadata);
      metadata = thumbnailResult.metadata;
      thumbnailError = thumbnailResult.error;
    } else {
      metadata = {
        ...metadata,
        status: {
          ...metadata.status,
          thumbnail: 'skipped'
        }
      };
    }

    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);

    const errors = [recognitionError, thumbnailError].filter(Boolean);

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? `Generated asset at ${assetDir}` : `Generated asset with warnings at ${assetDir}`,
      assetDir,
      metadataPath,
      error: errors.join('; ') || undefined
    };
  }

  public async annotate(input: AnnotateCommandInput): Promise<CommandResult> {
    if (input.dryRun) {
      return {
        success: true,
        message: `[dry-run] annotate ${input.assetPath}`
      };
    }

    const assetDir = await this.resolveAssetDir(input.assetPath);
    let metadata = await this.deps.metadataService.load(assetDir);
    const recognitionResult = await this.applyRecognition(assetDir, metadata, input.overwrite);
    metadata = recognitionResult.metadata;
    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);

    return {
      success: !recognitionResult.error,
      message: recognitionResult.error ? `Annotation failed for ${assetDir}` : `Annotated asset at ${assetDir}`,
      assetDir,
      metadataPath,
      error: recognitionResult.error
    };
  }

  public async thumbnail(input: ThumbnailCommandInput): Promise<CommandResult> {
    if (input.dryRun) {
      return {
        success: true,
        message: `[dry-run] thumbnail ${input.assetPath}`
      };
    }

    const assetDir = await this.resolveAssetDir(input.assetPath);
    let metadata = await this.deps.metadataService.load(assetDir);
    const thumbnailResult = await this.applyThumbnail(assetDir, metadata);
    metadata = thumbnailResult.metadata;
    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);

    return {
      success: !thumbnailResult.error,
      message: thumbnailResult.error ? `Thumbnail failed for ${assetDir}` : `Created thumbnail for ${assetDir}`,
      assetDir,
      metadataPath,
      error: thumbnailResult.error
    };
  }

  public async batch(jobs: BatchJobDefinition[], outputOverride?: string, dryRun = false): Promise<BatchCommandResult> {
    const results: CommandResult[] = [];

    for (const job of jobs) {
      try {
        const result = await this.runBatchJob(job, outputOverride, dryRun);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          message: `Failed batch job ${job.slug ?? job.prompt ?? job.assetPath ?? 'unknown'}`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const failed = results.filter((result) => !result.success).length;
    return {
      success: failed === 0,
      total: results.length,
      succeeded: results.length - failed,
      failed,
      results
    };
  }

  private async runBatchJob(job: BatchJobDefinition, outputOverride?: string, dryRun = false): Promise<CommandResult> {
    if (job.prompt) {
      return this.generate({
        prompt: job.prompt,
        output: outputOverride ?? job.output ?? '.',
        slug: job.slug,
        title: job.title,
        tags: job.tags ?? [],
        annotate: job.annotate ?? false,
        thumbnail: job.thumbnail ?? false,
        dryRun
      });
    }

    if (job.assetPath && job.annotate) {
      return this.annotate({
        assetPath: job.assetPath,
        overwrite: job.overwriteRecognition ?? false,
        dryRun
      });
    }

    if (job.assetPath && job.thumbnail) {
      return this.thumbnail({
        assetPath: job.assetPath,
        dryRun
      });
    }

    throw new AppError('Batch jobs must either generate from prompt or operate on an existing assetPath.', 2);
  }

  private async applyRecognition(
    assetDir: string,
    metadata: AssetMetadata,
    overwrite: boolean
  ): Promise<{ metadata: AssetMetadata; error?: string }> {
    if (!this.deps.visionProvider) {
      throw new AppError('Vision recognition provider is not configured.', 2);
    }

    try {
      const originalPath = path.join(assetDir, metadata.paths.original);
      const buffer = await fs.readFile(originalPath);
      const recognition = await this.deps.visionProvider.recognizeImage({
        buffer,
        mimeType: mimeTypeFromFilename(originalPath),
        model: metadata.recognized?.model
      });
      return {
        metadata: this.deps.metadataService.applyRecognition(metadata, recognition, this.deps.now().toISOString(), overwrite)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown recognition error';
      return {
        metadata: this.deps.metadataService.markRecognitionFailure(metadata, this.deps.now().toISOString(), message),
        error: message
      };
    }
  }

  private async applyThumbnail(assetDir: string, metadata: AssetMetadata): Promise<{ metadata: AssetMetadata; error?: string }> {
    try {
      const originalPath = path.join(assetDir, metadata.paths.original);
      const thumbnail = await this.deps.thumbnailService.createThumbnail(assetDir, originalPath, this.deps.thumbnailConfig);
      return {
        metadata: this.deps.metadataService.applyThumbnail(
          metadata,
          thumbnail.filename,
          thumbnail.format,
          thumbnail.width,
          thumbnail.height,
          this.deps.now().toISOString()
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown thumbnail error';
      return {
        metadata: this.deps.metadataService.markThumbnailFailure(metadata, this.deps.now().toISOString(), message),
        error: message
      };
    }
  }

  private async resolveAssetDir(assetPath: string): Promise<string> {
    const resolvedPath = path.resolve(assetPath);
    const stats = await fs.stat(resolvedPath);
    if (stats.isDirectory()) {
      return resolvedPath;
    }
    return path.dirname(resolvedPath);
  }
}

function mimeTypeFromFilename(filename: string): string {
  if (filename.endsWith('.png')) {
    return 'image/png';
  }
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (filename.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'application/octet-stream';
}
