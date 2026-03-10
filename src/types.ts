export type ProcessingState = 'pending' | 'succeeded' | 'failed' | 'skipped';

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  tags?: string[];
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
}

export interface VisionRecognitionResult {
  title?: string;
  tags?: string[];
  description?: string;
  provider: string;
  model?: string;
  raw?: unknown;
}

export interface AssetMetadata {
  schemaVersion: 1;
  assetId: string;
  slug: string;
  title: string;
  tags: string[];
  description?: string;
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
  };
  recognized?: {
    title?: string;
    tags?: string[];
    description?: string;
    provider?: string;
    model?: string;
    updatedAt?: string;
    overwriteApplied?: boolean;
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
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
  extra?: Record<string, unknown>;
}

export interface BatchJobDefinition {
  prompt?: string;
  slug?: string;
  output?: string;
  title?: string;
  tags?: string[];
  annotate?: boolean;
  thumbnail?: boolean;
  assetPath?: string;
  overwriteRecognition?: boolean;
}

export interface BatchManifest {
  jobs: BatchJobDefinition[];
}

export interface GenerateCommandInput {
  prompt: string;
  output: string;
  slug?: string;
  title?: string;
  tags: string[];
  annotate: boolean;
  thumbnail: boolean;
  dryRun: boolean;
}

export interface AnnotateCommandInput {
  assetPath: string;
  overwrite: boolean;
  dryRun: boolean;
}

export interface ThumbnailCommandInput {
  assetPath: string;
  dryRun: boolean;
}

export interface BatchCommandInput {
  manifestPath: string;
  output?: string;
  dryRun: boolean;
}

export interface CommandResult {
  success: boolean;
  message: string;
  assetDir?: string;
  metadataPath?: string;
  error?: string;
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
