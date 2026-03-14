import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import type {
  AnnotateCommandInput,
  AssetMetadata,
  BatchCommandResult,
  BatchJobDefinition,
  CommandResult,
  CommandStepResult,
  FilenameHintSource,
  GenerateCommandInput,
  ImageGenerationProvider,
  ThumbnailCommandInput,
  VisionRecognitionProvider
} from '../types.js';
import { AssetWriter } from './asset-writer.js';
import { ManagedAssetScanner } from './managed-asset-scanner.js';
import { MetadataService } from './metadata.js';
import { PromptSourceLoader } from './prompt-source-loader.js';
import { SearchIndexService, deriveLibraryRootFromAssetDir } from './search-index.js';
import { ThumbnailService } from './thumbnail.js';

export interface JobRunnerDependencies {
  imageProvider?: ImageGenerationProvider;
  visionProvider?: VisionRecognitionProvider;
  assetWriter: AssetWriter;
  metadataService: MetadataService;
  thumbnailService: ThumbnailService;
  promptSourceLoader: PromptSourceLoader;
  managedAssetScanner: ManagedAssetScanner;
  searchIndexService: SearchIndexService;
  defaultAnalysisPromptPath: string;
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
    const normalized = await this.deps.promptSourceLoader.loadGenerationInput({
      prompt: input.prompt,
      promptFile: input.promptFile,
      tags: input.tags
    });

    const steps: CommandStepResult[] = [
      {
        step: 'normalize',
        status: 'succeeded',
        message:
          normalized.promptSource.type === 'docs-prompt-file'
            ? `Loaded docs prompt file ${normalized.promptSource.path}`
            : 'Using raw prompt text'
      }
    ];

    if (input.dryRun) {
      return this.buildDryRunResult(`[dry-run] generate ${normalized.prompt}`, steps);
    }

    if (!this.deps.imageProvider) {
      throw new AppError('Image generation provider is not configured.', 2);
    }

    const now = this.deps.now();
    const generation = await this.deps.imageProvider.createImage({
      prompt: normalized.prompt,
      tags: normalized.tags,
      generationParams: normalized.generationParams,
      promptSource: normalized.promptSource
    });

    const { assetDir, assetId, slug } = await this.deps.assetWriter.createAssetDirectory({
      outputRoot: input.output,
      slug: input.slug,
      prompt: normalized.prompt,
      now
    });

    steps.push({
      step: 'generate',
      status: 'succeeded',
      message: `Generated image asset at ${assetDir}`
    });

    const originalFilename = await this.deps.assetWriter.writeOriginalAsset(assetDir, generation.buffer, generation.mimeType);
    let metadata = this.deps.metadataService.createInitialMetadata({
      assetId,
      slug,
      assetDir,
      originalFilename,
      prompt: normalized.prompt,
      promptSource: normalized.promptSource,
      generationParams: normalized.generationParams,
      title: input.title,
      tags: normalized.tags,
      generatedProvider: generation.provider,
      generatedModel: generation.model,
      createdAt: now.toISOString(),
      source: {
        type: 'generated'
      },
      generationState: 'succeeded',
      recognitionState: 'pending',
      thumbnailState: 'pending',
      providerPayload: {
        image: generation.raw
      }
    });

    if (input.annotate) {
      const recognitionResult = await this.applyRecognition(assetDir, metadata, false, input.analysisPromptPath);
      metadata = recognitionResult.metadata;
      steps.push(recognitionResult.step);
    } else {
      steps.push({
        step: 'recognition',
        status: 'skipped',
        message: 'Metadata analysis deferred; asset remains pending analysis.'
      });
    }

    if (input.thumbnail) {
      const thumbnailResult = await this.applyThumbnail(assetDir, metadata);
      metadata = thumbnailResult.metadata;
      steps.push(thumbnailResult.step);
    } else {
      metadata = {
        ...metadata,
        status: {
          ...metadata.status,
          thumbnail: 'skipped'
        }
      };
      steps.push({
        step: 'thumbnail',
        status: 'skipped',
        message: 'Thumbnail generation skipped.'
      });
    }

    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);
    await this.syncSearchIndex(assetDir, input.output);
    return this.finalizeCommandResult('Generated asset', assetDir, metadataPath, steps);
  }

  public async annotate(input: AnnotateCommandInput): Promise<CommandResult> {
    const steps: CommandStepResult[] = [];

    if (input.dryRun) {
      const message = input.importTo ? `[dry-run] import and annotate ${input.assetPath}` : `[dry-run] annotate ${input.assetPath}`;
      return this.buildDryRunResult(message, steps);
    }

    let assetDir: string;
    let metadata: AssetMetadata;
    const now = this.deps.now();

    if (input.importTo) {
      const sourcePath = path.resolve(input.assetPath);
      const { assetDir: nextAssetDir, assetId, slug } = await this.deps.assetWriter.createAssetDirectory({
        outputRoot: input.importTo,
        slug: input.slug,
        sourcePath,
        now
      });
      const originalFilename = await this.deps.assetWriter.importOriginalAsset(nextAssetDir, sourcePath);
      assetDir = nextAssetDir;
      metadata = this.deps.metadataService.createInitialMetadata({
        assetId,
        slug,
        assetDir,
        originalFilename,
        title: input.title,
        tags: input.tags,
        createdAt: now.toISOString(),
        source: {
          type: 'imported',
          originalPath: sourcePath,
          importedAt: now.toISOString()
        },
        generationState: 'skipped',
        recognitionState: 'pending',
        thumbnailState: input.thumbnail ? 'pending' : 'skipped'
      });
      steps.push({
        step: 'import',
        status: 'succeeded',
        message: `Imported external image into ${assetDir}`
      });
    } else {
      assetDir = await this.resolveManagedAssetDir(input.assetPath);
      metadata = await this.deps.metadataService.load(assetDir);
    }

    const recognitionResult = await this.applyRecognition(assetDir, metadata, input.overwrite, input.analysisPromptPath);
    metadata = recognitionResult.metadata;
    steps.push(recognitionResult.step);

    if (input.thumbnail) {
      const thumbnailResult = await this.applyThumbnail(assetDir, metadata);
      metadata = thumbnailResult.metadata;
      steps.push(thumbnailResult.step);
    }

    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);
    await this.syncSearchIndex(assetDir, input.importTo);
    return this.finalizeCommandResult(input.importTo ? 'Imported and analyzed asset' : 'Annotated asset', assetDir, metadataPath, steps);
  }

  public async thumbnail(input: ThumbnailCommandInput): Promise<CommandResult> {
    const steps: CommandStepResult[] = [];

    if (input.dryRun) {
      return this.buildDryRunResult(`[dry-run] thumbnail ${input.assetPath}`, steps);
    }

    const assetDir = await this.resolveManagedAssetDir(input.assetPath);
    let metadata = await this.deps.metadataService.load(assetDir);
    const thumbnailResult = await this.applyThumbnail(assetDir, metadata);
    metadata = thumbnailResult.metadata;
    steps.push(thumbnailResult.step);
    const metadataPath = await this.deps.metadataService.save(assetDir, metadata);
    await this.syncSearchIndex(assetDir);

    return this.finalizeCommandResult('Created thumbnail', assetDir, metadataPath, steps);
  }

  public async batch(jobs: BatchJobDefinition[], outputOverride?: string, dryRun = false): Promise<BatchCommandResult> {
    const results: CommandResult[] = [];

    for (const job of jobs) {
      try {
        const items = await this.runBatchJob(job, outputOverride, dryRun);
        results.push(...items);
      } catch (error) {
        results.push({
          success: false,
          message: `Failed batch job ${job.slug ?? job.prompt ?? job.promptFile ?? job.assetPath ?? job.pendingLibrary ?? 'unknown'}`,
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

  private async runBatchJob(job: BatchJobDefinition, outputOverride?: string, dryRun = false): Promise<CommandResult[]> {
    if (job.pendingLibrary) {
      const assetDirs = await this.deps.managedAssetScanner.findPendingRecognitionAssets(job.pendingLibrary);
      if (assetDirs.length === 0) {
        return [
          {
            success: true,
            message: `No pending analysis assets found in ${path.resolve(job.pendingLibrary)}`,
            steps: [
              {
                step: 'scan',
                status: 'succeeded',
                message: `Scanned ${path.resolve(job.pendingLibrary)} and found no pending assets`
              }
            ]
          }
        ];
      }

      const results: CommandResult[] = [];
      for (const assetDir of assetDirs) {
        results.push(
          await this.annotate({
            assetPath: assetDir,
            overwrite: job.overwriteRecognition ?? false,
            dryRun,
            analysisPromptPath: job.analysisPromptPath
          })
        );
      }
      return results;
    }

    if (job.prompt || job.promptFile) {
      return [
        await this.generate({
          prompt: job.prompt,
          promptFile: job.promptFile,
          output: outputOverride ?? job.output ?? '.',
          slug: job.slug,
          title: job.title,
          tags: job.tags ?? [],
          annotate: job.annotate ?? false,
          thumbnail: job.thumbnail ?? false,
          dryRun,
          analysisPromptPath: job.analysisPromptPath
        })
      ];
    }

    if (job.assetPath) {
      if (job.thumbnail && !job.importTo && job.annotate === false) {
        return [
          await this.thumbnail({
            assetPath: job.assetPath,
            dryRun
          })
        ];
      }

      return [
        await this.annotate({
          assetPath: job.assetPath,
          overwrite: job.overwriteRecognition ?? false,
          dryRun,
          importTo: job.importTo,
          analysisPromptPath: job.analysisPromptPath,
          slug: job.slug,
          title: job.title,
          tags: job.tags,
          thumbnail: job.thumbnail
        })
      ];
    }

    throw new AppError('Batch jobs must either generate from prompt/promptFile, operate on assetPath, or scan a pendingLibrary.', 2);
  }

  private async applyRecognition(
    assetDir: string,
    metadata: AssetMetadata,
    overwrite: boolean,
    analysisPromptPath?: string
  ): Promise<{ metadata: AssetMetadata; step: CommandStepResult }> {
    if (!this.deps.visionProvider) {
      throw new AppError('Analysis provider is not configured.', 2);
    }

    let loadedPrompt;
    try {
      loadedPrompt = await this.deps.promptSourceLoader.loadAnalysisPrompt(this.deps.defaultAnalysisPromptPath, analysisPromptPath);
      const originalPath = path.join(assetDir, metadata.paths.original);
      const buffer = await fs.readFile(originalPath);
      const filenameHint = this.deriveFilenameHint(assetDir, metadata);
      const recognition = await this.deps.visionProvider.recognizeImage({
        buffer,
        mimeType: mimeTypeFromFilename(originalPath),
        model: metadata.recognized?.model,
        prompt: loadedPrompt.text,
        promptMetadata: loadedPrompt.metadata,
        filePath: originalPath,
        filenameHint: filenameHint?.text,
        filenameHintSource: filenameHint?.source
      });
      return {
        metadata: this.deps.metadataService.applyRecognition(metadata, recognition, this.deps.now().toISOString(), overwrite, loadedPrompt.metadata),
        step: {
          step: 'recognition',
          status: 'succeeded',
          message: `Metadata analysis succeeded using ${loadedPrompt.metadata.id}`
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown recognition error';
      return {
        metadata: this.deps.metadataService.markRecognitionFailure(
          metadata,
          this.deps.now().toISOString(),
          message,
          loadedPrompt?.metadata
        ),
        step: {
          step: 'recognition',
          status: 'failed',
          message: 'Metadata analysis failed',
          error: message
        }
      };
    }
  }

  private async applyThumbnail(assetDir: string, metadata: AssetMetadata): Promise<{ metadata: AssetMetadata; step: CommandStepResult }> {
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
        ),
        step: {
          step: 'thumbnail',
          status: 'succeeded',
          message: `Created thumbnail ${thumbnail.filename}`
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown thumbnail error';
      return {
        metadata: this.deps.metadataService.markThumbnailFailure(metadata, this.deps.now().toISOString(), message),
        step: {
          step: 'thumbnail',
          status: 'failed',
          message: 'Thumbnail generation failed',
          error: message
        }
      };
    }
  }

  private buildDryRunResult(message: string, steps: CommandStepResult[]): CommandResult {
    return {
      success: true,
      message,
      steps
    };
  }

  private finalizeCommandResult(label: string, assetDir: string, metadataPath: string, steps: CommandStepResult[]): CommandResult {
    const failedSteps = steps.filter((step) => step.status === 'failed');
    const warnings = failedSteps.map((step) => step.error ?? step.message);
    const success = failedSteps.length === 0;

    return {
      success,
      message: success ? `${label} at ${assetDir}` : `${label} with warnings at ${assetDir}`,
      assetDir,
      metadataPath,
      error: warnings.join('; ') || undefined,
      warnings: warnings.length ? warnings : undefined,
      steps
    };
  }

  private async resolveManagedAssetDir(assetPath: string): Promise<string> {
    const resolvedPath = path.resolve(assetPath);
    const stats = await fs.stat(resolvedPath);
    const candidate = stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
    const metadataPath = path.join(candidate, 'metadata.json');

    try {
      await fs.access(metadataPath);
      return candidate;
    } catch {
      throw new AppError(`Managed asset metadata not found for ${assetPath}. Use --import-to to copy a standalone image into the library first.`, 2);
    }
  }

  private async syncSearchIndex(assetDir: string, libraryRoot?: string): Promise<void> {
    const resolvedLibraryRoot = path.resolve(libraryRoot ?? deriveLibraryRootFromAssetDir(assetDir));
    try {
      await this.deps.searchIndexService.syncAsset(resolvedLibraryRoot, assetDir);
    } catch {
      // Search index sync is best-effort; the search command can rebuild lazily later.
    }
  }

  private deriveFilenameHint(assetDir: string, metadata: AssetMetadata): { text: string; source: FilenameHintSource } | undefined {
    const sourceOriginalPath = metadata.source?.originalPath;
    const sourceFilename = sourceOriginalPath ? path.basename(sourceOriginalPath) : undefined;
    if (isDescriptiveFilenameCandidate(sourceFilename)) {
      return {
        text: sourceFilename!,
        source: 'source.originalPath'
      };
    }

    if (isDescriptiveFilenameCandidate(metadata.slug)) {
      return {
        text: metadata.slug,
        source: 'slug'
      };
    }

    const assetDirName = path.basename(assetDir);
    if (isDescriptiveFilenameCandidate(assetDirName)) {
      return {
        text: assetDirName,
        source: 'assetDir'
      };
    }

    return undefined;
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
  if (filename.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'application/octet-stream';
}

function isDescriptiveFilenameCandidate(candidate?: string): boolean {
  if (!candidate) {
    return false;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = path.parse(trimmed);
  const normalizedStem = normalizeFilenameStem(parsed.name || trimmed);
  return normalizedStem !== '' && !/^(original|asset)\d*$/.test(normalizedStem);
}

function normalizeFilenameStem(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
