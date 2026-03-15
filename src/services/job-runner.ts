import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError, RecognitionError } from '../lib/errors.js';
import type {
  AnalysisPromptMetadata,
  AnnotateCommandInput,
  AssetMetadata,
  BatchCommandResult,
  BatchJobDefinition,
  CommandResult,
  CommandStepResult,
  FilenameHintSource,
  GenerateCommandInput,
  ImageGenerationProvider,
  RecognitionContext,
  RecognitionFailureKind,
  RecognitionRetryMode,
  RecognitionRetryRecord,
  RecognitionSceneHint,
  RecognitionSceneType,
  RecognitionValidationDiagnostic,
  LoadedAnalysisContext,
  ThumbnailCommandInput,
  VisionRecognitionRequest,
  VisionRecognitionResult,
  VisionRecognitionProvider
} from '../types.js';
import { AssetWriter } from './asset-writer.js';
import { ManagedAssetScanner } from './managed-asset-scanner.js';
import { MetadataService } from './metadata.js';
import { PromptSourceLoader } from './prompt-source-loader.js';
import { RecognitionValidator } from './recognition-validator.js';
import { SearchIndexService, deriveLibraryRootFromAssetDir } from './search-index.js';
import { ThumbnailService } from './thumbnail.js';

export interface JobRunnerDependencies {
  imageProvider?: ImageGenerationProvider;
  visionProvider?: VisionRecognitionProvider;
  assetWriter: AssetWriter;
  metadataService: MetadataService;
  recognitionValidator: RecognitionValidator;
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
      const recognitionResult = await this.applyRecognition(
        assetDir,
        metadata,
        false,
        input.analysisPromptPath,
        input.analysisContext,
        input.analysisContextFile
      );
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

    const recognitionResult = await this.applyRecognition(
      assetDir,
      metadata,
      input.overwrite,
      input.analysisPromptPath,
      input.analysisContext,
      input.analysisContextFile
    );
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
            analysisPromptPath: job.analysisPromptPath,
            analysisContext: job.analysisContext,
            analysisContextFile: job.analysisContextFile
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
          analysisPromptPath: job.analysisPromptPath,
          analysisContext: job.analysisContext,
          analysisContextFile: job.analysisContextFile
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
          analysisContext: job.analysisContext,
          analysisContextFile: job.analysisContextFile,
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
    analysisPromptPath?: string,
    analysisContext?: string,
    analysisContextFile?: string
  ): Promise<{ metadata: AssetMetadata; step: CommandStepResult }> {
    let loadedPrompt;
    let loadedContext: LoadedAnalysisContext | undefined;
    try {
      loadedPrompt = await this.deps.promptSourceLoader.loadAnalysisPrompt(this.deps.defaultAnalysisPromptPath, analysisPromptPath);
      loadedContext = await this.deps.promptSourceLoader.requireAnalysisContext(analysisContext, analysisContextFile);
      const originalPath = path.join(assetDir, metadata.paths.original);
      const buffer = await fs.readFile(originalPath);
      const filenameHint = this.deriveFilenameHint(assetDir, metadata);
      const context = this.buildRecognitionContext(assetDir, metadata, 1, 'initial', loadedContext);
      const firstAttempt = await this.runRecognitionAttempt({
        originalPath,
        buffer,
        metadata,
        promptMetadata: loadedPrompt.metadata,
        promptText: this.buildSceneAwarePrompt(loadedPrompt.text, context, loadedContext),
        filenameHint,
        context
      });

      let acceptedAttempt = firstAttempt;
      const retryHistory: RecognitionRetryRecord[] = [];

      if (!firstAttempt.validation.accepted) {
        retryHistory.push({
          attempt: firstAttempt.context.retry.attempt,
          mode: firstAttempt.context.retry.mode,
          reason: formatDiagnostics(firstAttempt.validation.diagnostics),
          diagnostics: firstAttempt.validation.diagnostics
        });

        if (!firstAttempt.validation.recoverable) {
          return this.failRecognition(metadata, loadedPrompt.metadata, 'validation', retryHistory, firstAttempt.validation.diagnostics);
        }

        const retryContext = this.buildRecognitionContext(assetDir, metadata, 2, 'strict-retry', loadedContext);
        const retryAttempt = await this.runRecognitionAttempt({
          originalPath,
          buffer,
          metadata,
          promptMetadata: loadedPrompt.metadata,
          promptText: this.buildStrictRetryPrompt(loadedPrompt.text, retryContext, firstAttempt.validation.diagnostics, loadedContext),
          filenameHint,
          context: retryContext
        });

        if (!retryAttempt.validation.accepted) {
          retryHistory.push({
            attempt: retryAttempt.context.retry.attempt,
            mode: retryAttempt.context.retry.mode,
            reason: formatDiagnostics(retryAttempt.validation.diagnostics),
            diagnostics: retryAttempt.validation.diagnostics
          });
          return this.failRecognition(metadata, loadedPrompt.metadata, 'validation', retryHistory, retryAttempt.validation.diagnostics);
        }

        acceptedAttempt = retryAttempt;
      }

      const nowIso = this.deps.now().toISOString();
      const provenance = {
        providerId: this.inferProviderId(acceptedAttempt.recognition.provider),
        provider: acceptedAttempt.recognition.provider,
        model: acceptedAttempt.recognition.model,
        promptId: loadedPrompt.metadata.id,
        promptPath: loadedPrompt.metadata.path,
        promptSourceType: loadedPrompt.metadata.type,
        sceneType: acceptedAttempt.context.selectedScene,
        attempt: acceptedAttempt.context.retry.attempt,
        mode: acceptedAttempt.context.retry.mode,
        updatedAt: nowIso,
        analysisContextType: loadedContext?.metadata.type,
        analysisContextPath: loadedContext?.metadata.path,
        analysisContextPreview: loadedContext?.metadata.preview
      } as const;

      return {
        metadata: this.deps.metadataService.applyRecognition(metadata, acceptedAttempt.validation.normalized, nowIso, overwrite, loadedPrompt.metadata, {
          provenance,
          diagnostics: acceptedAttempt.validation.diagnostics,
          retryHistory
        }),
        step: {
          step: 'recognition',
          status: 'succeeded',
          message:
            retryHistory.length > 0
              ? `Metadata analysis succeeded using ${loadedPrompt.metadata.id} after a stricter retry`
              : `Metadata analysis succeeded using ${loadedPrompt.metadata.id}`
        }
      };
    } catch (error) {
      const normalizedError = this.normalizeRecognitionError(error);
      return this.failRecognition(metadata, loadedPrompt?.metadata, normalizedError.kind, [], normalizedError.diagnostics, normalizedError.message);
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

  private async runRecognitionAttempt(input: {
    originalPath: string;
    buffer: Buffer;
    metadata: AssetMetadata;
    promptMetadata: AnalysisPromptMetadata;
    promptText: string;
    filenameHint?: { text: string; source: FilenameHintSource };
    context: RecognitionContext;
  }): Promise<{
    recognition: VisionRecognitionResult;
    validation: ReturnType<RecognitionValidator['validate']>;
    context: RecognitionContext;
  }> {
    const recognition = await this.invokeVisionProvider({
      buffer: input.buffer,
      mimeType: mimeTypeFromFilename(input.originalPath),
      model: input.metadata.recognized?.model,
      prompt: input.promptText,
      promptMetadata: input.promptMetadata,
      filePath: input.originalPath,
      filenameHint: input.filenameHint?.text,
      filenameHintSource: input.filenameHint?.source,
      recognitionContext: input.context
    });

    return {
      recognition,
      validation: this.deps.recognitionValidator.validate(recognition, input.context),
      context: input.context
    };
  }

  private async invokeVisionProvider(request: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    if (!this.deps.visionProvider) {
      throw new RecognitionError('Analysis provider is not configured.', 'provider-resolution');
    }

    try {
      return await this.deps.visionProvider.recognizeImage(request);
    } catch (error) {
      if (error instanceof RecognitionError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown recognition error';
      throw new RecognitionError(message, 'provider-execution');
    }
  }

  private failRecognition(
    metadata: AssetMetadata,
    promptMetadata: AnalysisPromptMetadata | undefined,
    kind: RecognitionFailureKind,
    retryHistory: RecognitionRetryRecord[],
    diagnostics: RecognitionValidationDiagnostic[] = [],
    message = buildRecognitionFailureMessage(kind, diagnostics)
  ): { metadata: AssetMetadata; step: CommandStepResult } {
    return {
      metadata: this.deps.metadataService.markRecognitionFailure(
        metadata,
        this.deps.now().toISOString(),
        message,
        kind,
        diagnostics,
        retryHistory,
        promptMetadata
      ),
      step: {
        step: 'recognition',
        status: 'failed',
        message: buildRecognitionStepMessage(kind),
        error: message
      }
    };
  }

  private buildRecognitionContext(
    assetDir: string,
    metadata: AssetMetadata,
    attempt: number,
    mode: RecognitionRetryMode,
    analysisContext?: LoadedAnalysisContext
  ): RecognitionContext {
    const sceneHints = this.inferSceneHints(assetDir, metadata, analysisContext);

    return {
      assetId: metadata.assetId,
      assetDir,
      slug: metadata.slug,
      sourceType: metadata.source?.type,
      selectedScene: selectScene(sceneHints),
      sceneHints,
      analysisContext: analysisContext?.metadata,
      retry: {
        attempt,
        maxAttempts: 2,
        mode
      }
    };
  }

  private inferSceneHints(assetDir: string, metadata: AssetMetadata, analysisContext?: LoadedAnalysisContext): RecognitionSceneHint[] {
    const haystack = [
      metadata.slug,
      metadata.title,
      metadata.generated.prompt,
      ...(metadata.generated.tags ?? []),
      metadata.source?.originalPath ? path.basename(metadata.source.originalPath) : undefined,
      path.basename(assetDir),
      analysisContext?.text
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const hasUi = containsAsciiWord(haystack, ['ui', 'dashboard', 'panel', 'screen', 'screenshot', 'layout', 'app', 'product']);
    const hasAdmin = containsAsciiWord(haystack, ['admin', 'cms', 'settings', 'analytics', 'report', 'backoffice', 'console']);
    const hasWireframe = containsAsciiWord(haystack, ['wireframe', 'mockup', 'figma', 'prototype', 'lofi', 'hifi']);
    const hasGame = containsAsciiWord(haystack, ['game', 'inventory', 'quest', 'skill', 'editor', 'hud', 'battle', 'team']);
    const hasIllustration = containsAsciiWord(haystack, ['illustration', 'character', 'concept', 'art', 'poster', 'mascot']);
    const hasDungeon = containsAsciiWord(haystack, ['dungeon', 'raid', 'instance', 'mission', 'questline']) || containsSubstring(haystack, ['副本', '地下城', '关卡', '迷宫']);
    const hasSquad = containsAsciiWord(haystack, ['squad', 'roster', 'party', 'team', 'crew', 'adventure', 'adventurer']) || containsSubstring(haystack, ['冒险团', '队伍', '阵容', '编队', '小队']);
    const hasManagement =
      containsAsciiWord(haystack, ['manage', 'management', 'editor', 'config', 'configure', 'assignment', 'roster']) ||
      containsSubstring(haystack, ['管理', '配置', '编辑', '分配']);
    const hasChineseUi = containsSubstring(haystack, ['界面', '面板', '页面', '列表', '卡片', '工作台', '控制台']);

    const hints: RecognitionSceneHint[] = [];
    if (hasUi) {
      hints.push({ type: 'product-ui', reason: 'Prompt or asset metadata suggests a product/application UI.', confidence: 'medium' });
    }
    if (hasAdmin) {
      hints.push({ type: 'admin-ui', reason: 'Keywords suggest dashboards, settings, or admin surfaces.', confidence: 'high' });
    }
    if (hasWireframe) {
      hints.push({ type: 'wireframe', reason: 'Keywords suggest a mockup or wireframe artifact.', confidence: 'high' });
    }
    if (hasGame) {
      hints.push({ type: 'game-editor', reason: 'Keywords suggest game HUD, editor, or gameplay tooling.', confidence: 'medium' });
    }
    if (hasIllustration && (hasAdmin || hasGame || containsAsciiWord(haystack, ['ui', 'screen', 'screenshot', 'editor', 'panel', 'layout']))) {
      hints.push({ type: 'illustration-mixed', reason: 'Both interface and illustration terms are present.', confidence: 'high' });
    }
    if ((hasDungeon && hasSquad) || (hasManagement && hasGame) || (hasGame && hasChineseUi)) {
      hints.push({
        type: 'game-editor',
        reason: 'Keywords suggest a game roster, dungeon, or management editor workflow.',
        confidence: 'high'
      });
    }
    if ((hasUi || hasChineseUi) && hasIllustration && (hasDungeon || hasSquad || hasManagement)) {
      hints.push({
        type: 'illustration-mixed',
        reason: 'Context suggests a UI that also includes character or illustration content.',
        confidence: 'high'
      });
    }

    return hints.length > 0 ? hints : [{ type: 'general', reason: 'No higher-confidence scene cues were detected.', confidence: 'low' }];
  }

  private buildSceneAwarePrompt(basePrompt: string, context: RecognitionContext, analysisContext?: LoadedAnalysisContext): string {
    const sections = [basePrompt.trim(), buildSceneProfileBlock(context.selectedScene)];

    if (analysisContext) {
      sections.push(
        [
          'Project or user supplied context (auxiliary only):',
          analysisContext.text,
          'Treat this context as a supporting hint. If it conflicts with visible image evidence, trust the image.'
        ].join('\n')
      );
    }

    return sections.join('\n\n');
  }

  private buildStrictRetryPrompt(
    basePrompt: string,
    context: RecognitionContext,
    diagnostics: RecognitionValidationDiagnostic[],
    analysisContext?: LoadedAnalysisContext
  ): string {
    return [
      this.buildSceneAwarePrompt(basePrompt, context, analysisContext),
      [
        'Stricter retry constraints:',
        '- Re-evaluate the visible image evidence before naming entities or themes.',
        '- Do not repeat prior validation mistakes.',
        `- Fix these issues: ${formatDiagnostics(diagnostics)}`
      ].join('\n')
    ].join('\n\n');
  }

  private normalizeRecognitionError(error: unknown): RecognitionError {
    if (error instanceof RecognitionError) {
      return error;
    }

    if (error instanceof AppError && /analysis context/i.test(error.message)) {
      return new RecognitionError(error.message, 'validation');
    }

    return new RecognitionError(error instanceof Error ? error.message : 'Unknown recognition error', 'provider-execution');
  }

  private inferProviderId(provider: string): 'claude' | 'codex' | 'http' | undefined {
    if (provider.includes('claude')) {
      return 'claude';
    }
    if (provider.includes('codex')) {
      return 'codex';
    }
    if (provider.includes('http')) {
      return 'http';
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
  const compactStem = normalizedStem.replace(/\s+/g, '');
  return normalizedStem !== '' && !isPlaceholderFilename(compactStem);
}

function normalizeFilenameStem(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderFilename(compactStem: string): boolean {
  return (
    /^(original|asset|image|img|picture|photo|screenshot)\d*$/u.test(compactStem) ||
    /^(原图|图片|截图|未命名|素材|导出)\d*$/u.test(compactStem)
  );
}

function containsAsciiWord(haystack: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, 'u').test(haystack));
}

function containsSubstring(haystack: string, values: string[]): boolean {
  return values.some((value) => haystack.includes(value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectScene(hints: RecognitionSceneHint[]): RecognitionSceneType {
  const priority: RecognitionSceneType[] = ['illustration-mixed', 'admin-ui', 'wireframe', 'game-editor', 'product-ui', 'general'];
  for (const scene of priority) {
    if (hints.some((hint) => hint.type === scene)) {
      return scene;
    }
  }
  return 'general';
}

function buildSceneProfileBlock(scene: RecognitionSceneType): string {
  switch (scene) {
    case 'product-ui':
      return [
        'Scene profile guidance: product-ui',
        '- Prioritize visible interface structure, navigation, cards, charts, panels, and page purpose.',
        '- Avoid inventing character names, skins, or IP titles unless directly visible in the image.'
      ].join('\n');
    case 'admin-ui':
      return [
        'Scene profile guidance: admin-ui',
        '- Focus on dashboards, forms, settings, analytics, tables, status indicators, and workflows.',
        '- Treat dashboards and control panels as software/product surfaces first.'
      ].join('\n');
    case 'wireframe':
      return [
        'Scene profile guidance: wireframe',
        '- Emphasize layout structure, placeholders, components, and design fidelity rather than fictional narrative.',
        '- Mention wireframe/mockup qualities when they are visible.'
      ].join('\n');
    case 'game-editor':
      return [
        'Scene profile guidance: game-editor',
        '- Preserve editor or HUD semantics such as inventory, toolbars, panels, canvases, and controls.',
        '- Do not collapse the result into a single character or lore guess when the image is clearly an interface.'
      ].join('\n');
    case 'illustration-mixed':
      return [
        'Scene profile guidance: illustration-mixed',
        '- Preserve both interface and illustration semantics in the title, tags, and description.',
        '- Do not flatten the image into only a character label or only a pure UI label.'
      ].join('\n');
    case 'general':
    default:
      return [
        'Scene profile guidance: general',
        '- Stay grounded in visible image evidence and keep metadata concise.',
        '- Use filenames and slugs only as auxiliary hints.'
      ].join('\n');
  }
}

function formatDiagnostics(diagnostics: RecognitionValidationDiagnostic[]): string {
  return diagnostics.map((item) => item.message).join(' | ');
}

function buildRecognitionStepMessage(kind: RecognitionFailureKind): string {
  switch (kind) {
    case 'provider-resolution':
      return 'Metadata analysis failed during provider resolution';
    case 'validation':
      return 'Metadata analysis failed validation';
    case 'provider-execution':
    default:
      return 'Metadata analysis failed during provider execution';
  }
}

function buildRecognitionFailureMessage(
  kind: RecognitionFailureKind,
  diagnostics: RecognitionValidationDiagnostic[] = []
): string {
  if (kind === 'validation' && diagnostics.length > 0) {
    return `Validation failed: ${formatDiagnostics(diagnostics)}`;
  }

  switch (kind) {
    case 'provider-resolution':
      return 'Analysis provider could not be resolved from the current configuration.';
    case 'provider-execution':
      return 'Analysis provider failed while executing the multimodal recognition request.';
    case 'validation':
    default:
      return 'Recognition output failed validation.';
  }
}
