export type ProcessingState = 'pending' | 'succeeded' | 'failed' | 'skipped';
export type CommandStepName = 'normalize' | 'generate' | 'import' | 'recognition' | 'thumbnail' | 'scan';
export type AnalysisProviderId = 'claude' | 'codex' | 'http';
export type RecognitionSceneType = 'general' | 'product-ui' | 'admin-ui' | 'wireframe' | 'game-editor' | 'illustration-mixed';
export type RecognitionHintConfidence = 'low' | 'medium' | 'high';
export type RecognitionRetryMode = 'initial' | 'strict-retry';
export type RecognitionFailureKind = 'provider-resolution' | 'provider-execution' | 'validation';

export interface PromptSourceMetadata {
  type: 'raw' | 'docs-prompt-file';
  path?: string;
  context?: string;
  generationParams?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AnalysisPromptMetadata {
  type: 'default' | 'file';
  id: string;
  path: string;
}

export interface AnalysisContextMetadata {
  type: 'inline' | 'file';
  path?: string;
  preview: string;
}

export interface LoadedAnalysisPrompt {
  text: string;
  metadata: AnalysisPromptMetadata;
}

export interface LoadedAnalysisContext {
  text: string;
  metadata: AnalysisContextMetadata;
}

export interface NormalizedGenerationInput {
  prompt: string;
  tags: string[];
  promptSource: PromptSourceMetadata;
  generationParams?: Record<string, unknown>;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  tags?: string[];
  generationParams?: Record<string, unknown>;
  promptSource?: PromptSourceMetadata;
}

export interface ImageGenerationResult {
  buffer: Buffer;
  mimeType: string;
  provider: string;
  model?: string;
  requestId?: string;
  raw?: unknown;
}

export interface VisionRecognitionRequest {
  buffer: Buffer;
  mimeType: string;
  model?: string;
  prompt: string;
  promptMetadata: AnalysisPromptMetadata;
  filePath: string;
  filenameHint?: string;
  filenameHintSource?: FilenameHintSource;
  recognitionContext: RecognitionContext;
}

export interface VisionRecognitionResult {
  title?: string;
  tags?: string[];
  description?: string;
  provider: string;
  model?: string;
  sceneType?: RecognitionSceneType;
  validationDiagnostics?: RecognitionValidationDiagnostic[];
  retryHistory?: RecognitionRetryRecord[];
  provenance?: Partial<RecognitionProvenance>;
  requestId?: string;
  raw?: unknown;
}

export type FilenameHintSource = 'source.originalPath' | 'slug' | 'assetDir';

export interface RecognitionSceneHint {
  type: RecognitionSceneType;
  reason: string;
  confidence: RecognitionHintConfidence;
}

export interface RecognitionContext {
  assetId: string;
  assetDir: string;
  slug: string;
  sourceType?: 'generated' | 'imported';
  selectedScene: RecognitionSceneType;
  sceneHints: RecognitionSceneHint[];
  analysisContext?: AnalysisContextMetadata;
  retry: {
    attempt: number;
    maxAttempts: number;
    mode: RecognitionRetryMode;
  };
}

export interface RecognitionValidationDiagnostic {
  code: string;
  message: string;
  field?: 'title' | 'tags' | 'description' | 'result';
  recoverable: boolean;
}

export interface RecognitionRetryRecord {
  attempt: number;
  mode: RecognitionRetryMode;
  reason: string;
  diagnostics: RecognitionValidationDiagnostic[];
}

export interface RecognitionProvenance {
  providerId?: AnalysisProviderId;
  provider: string;
  model?: string;
  promptId: string;
  promptPath: string;
  promptSourceType: AnalysisPromptMetadata['type'];
  sceneType: RecognitionSceneType;
  attempt: number;
  mode: RecognitionRetryMode;
  updatedAt: string;
  analysisContextType?: AnalysisContextMetadata['type'];
  analysisContextPath?: string;
  analysisContextPreview?: string;
}

export interface RecognitionValidationSummary {
  accepted: boolean;
  diagnostics: RecognitionValidationDiagnostic[];
}

export interface AssetMetadata {
  schemaVersion: 1 | 2;
  assetId: string;
  slug: string;
  title: string;
  tags: string[];
  description?: string;
  source?: {
    type: 'generated' | 'imported';
    originalPath?: string;
    importedAt?: string;
  };
  paths: {
    assetDir: string;
    original: string;
    thumbnail?: string;
  };
  generated: {
    prompt?: string;
    provider?: string;
    model?: string;
    tags?: string[];
    title?: string;
    promptSource?: PromptSourceMetadata;
    generationParams?: Record<string, unknown>;
  };
  recognized?: {
    title?: string;
    tags?: string[];
    description?: string;
    provider?: string;
    providerId?: AnalysisProviderId;
    model?: string;
    updatedAt?: string;
    overwriteApplied?: boolean;
    promptId?: string;
    promptPath?: string;
    promptSourceType?: AnalysisPromptMetadata['type'];
    sceneType?: RecognitionSceneType;
    provenance?: RecognitionProvenance;
    validation?: RecognitionValidationSummary;
    retryHistory?: RecognitionRetryRecord[];
    lastErrorKind?: RecognitionFailureKind;
    lastError?: string;
  };
  manual?: {
    title?: string;
    tags?: string[];
    description?: string;
  };
  status: {
    generation: ProcessingState;
    recognition: ProcessingState;
    thumbnail: ProcessingState;
  };
  providerPayload?: {
    image?: unknown;
    vision?: unknown;
    analysis?: unknown;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
  extra?: Record<string, unknown>;
}

export interface BatchJobDefinition {
  prompt?: string;
  promptFile?: string;
  slug?: string;
  output?: string;
  title?: string;
  tags?: string[];
  annotate?: boolean;
  thumbnail?: boolean;
  assetPath?: string;
  importTo?: string;
  overwriteRecognition?: boolean;
  analysisPromptPath?: string;
  analysisContext?: string;
  analysisContextFile?: string;
  pendingLibrary?: string;
}

export interface BatchManifest {
  jobs: BatchJobDefinition[];
}

export interface GenerateCommandInput {
  prompt?: string;
  promptFile?: string;
  output: string;
  slug?: string;
  title?: string;
  tags: string[];
  annotate: boolean;
  thumbnail: boolean;
  dryRun: boolean;
  analysisPromptPath?: string;
  analysisContext?: string;
  analysisContextFile?: string;
}

export interface AnnotateCommandInput {
  assetPath: string;
  overwrite: boolean;
  dryRun: boolean;
  importTo?: string;
  analysisPromptPath?: string;
  analysisContext?: string;
  analysisContextFile?: string;
  slug?: string;
  title?: string;
  tags?: string[];
  thumbnail?: boolean;
}

export interface ThumbnailCommandInput {
  assetPath: string;
  dryRun: boolean;
}

export interface BatchCommandInput {
  manifestPath?: string;
  pendingLibrary?: string;
  output?: string;
  dryRun: boolean;
}

export type SearchMatchMode = 'exact' | 'fuzzy';
export type SearchOutputFormat = 'text' | 'json';
export type SearchableField =
  | 'slug'
  | 'title'
  | 'tags'
  | 'description'
  | 'generated.prompt'
  | 'generated.promptSource.path'
  | 'source.originalPath'
  | 'assetPath';

export interface SearchCommandInput {
  library: string;
  query: string;
  mode: SearchMatchMode;
  limit: number;
  output: SearchOutputFormat;
  reindex: boolean;
}

export interface SearchIndexDocument {
  assetId: string;
  slug: string;
  assetDir: string;
  metadataPath: string;
  title: string;
  tags: string[];
  description?: string;
  updatedAt: string;
  fields: Record<SearchableField, string[]>;
  searchText: string;
}

export interface SearchIndexFile {
  version: 1;
  libraryRoot: string;
  generatedAt: string;
  indexedCount: number;
  skippedCount: number;
  sourceFingerprints: Record<string, string>;
  documents: SearchIndexDocument[];
}

export interface SearchIndexBuildStats {
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  skippedAssets: string[];
}

export interface SearchIndexBuildResult {
  index: SearchIndexFile;
  stats: SearchIndexBuildStats;
}

export interface SearchResult {
  assetId: string;
  slug: string;
  assetDir: string;
  metadataPath: string;
  title: string;
  tags: string[];
  description?: string;
  score: number;
  matchedFields: SearchableField[];
}

export interface SearchCommandResult {
  success: boolean;
  query: string;
  mode: SearchMatchMode;
  library: string;
  rebuilt: boolean;
  rebuildReason?: string;
  indexPath: string;
  indexedCount: number;
  skippedCount: number;
  totalMatches: number;
  results: SearchResult[];
}

export interface CommandStepResult {
  step: CommandStepName;
  status: Exclude<ProcessingState, 'pending'>;
  message: string;
  error?: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  assetDir?: string;
  metadataPath?: string;
  error?: string;
  warnings?: string[];
  steps?: CommandStepResult[];
}

export interface BatchCommandResult {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: CommandResult[];
}

export interface ImageGenerationProvider {
  createImage(input: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface VisionRecognitionProvider {
  recognizeImage(input: VisionRecognitionRequest): Promise<VisionRecognitionResult>;
}

export interface SearchQueryService {
  search(input: SearchCommandInput): Promise<SearchCommandResult>;
}
