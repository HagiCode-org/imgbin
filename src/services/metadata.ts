import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { AnalysisPromptMetadata, AssetMetadata, ProcessingState, PromptSourceMetadata, VisionRecognitionResult } from '../types.js';
import { titleFromSlug } from '../lib/slug.js';

export interface CreateMetadataInput {
  assetId: string;
  slug: string;
  assetDir: string;
  originalFilename: string;
  prompt?: string;
  promptSource?: PromptSourceMetadata;
  generationParams?: Record<string, unknown>;
  title?: string;
  tags?: string[];
  generatedProvider?: string;
  generatedModel?: string;
  createdAt: string;
  generationState?: ProcessingState;
  recognitionState?: ProcessingState;
  thumbnailState?: ProcessingState;
  source?: AssetMetadata['source'];
  providerPayload?: AssetMetadata['providerPayload'];
}

export class MetadataService {
  public createInitialMetadata(input: CreateMetadataInput): AssetMetadata {
    const resolvedTitle = input.title ?? titleFromSlug(input.slug);
    const tags = dedupeStrings(input.tags ?? []);

    return {
      schemaVersion: 2,
      assetId: input.assetId,
      slug: input.slug,
      title: resolvedTitle,
      tags,
      source: input.source ?? { type: 'generated' },
      paths: {
        assetDir: input.assetDir,
        original: input.originalFilename
      },
      generated: {
        prompt: input.prompt,
        provider: input.generatedProvider,
        model: input.generatedModel,
        tags,
        title: resolvedTitle,
        promptSource: input.promptSource,
        generationParams: input.generationParams
      },
      status: {
        generation: input.generationState ?? 'succeeded',
        recognition: input.recognitionState ?? 'pending',
        thumbnail: input.thumbnailState ?? 'pending'
      },
      providerPayload: input.providerPayload,
      timestamps: {
        createdAt: input.createdAt,
        updatedAt: input.createdAt
      }
    };
  }

  public applyRecognition(
    metadata: AssetMetadata,
    recognition: VisionRecognitionResult,
    nowIso: string,
    overwrite: boolean,
    promptMetadata: AnalysisPromptMetadata
  ): AssetMetadata {
    const nextRecognized = overwrite
      ? {
          title: recognition.title,
          tags: dedupeStrings(recognition.tags ?? []),
          description: recognition.description,
          provider: recognition.provider,
          model: recognition.model,
          updatedAt: nowIso,
          overwriteApplied: true,
          promptId: promptMetadata.id,
          promptPath: promptMetadata.path,
          promptSourceType: promptMetadata.type,
          lastError: undefined
        }
      : {
          title: metadata.recognized?.title ?? recognition.title,
          tags: metadata.recognized?.tags?.length ? metadata.recognized.tags : dedupeStrings(recognition.tags ?? []),
          description: metadata.recognized?.description ?? recognition.description,
          provider: recognition.provider,
          model: recognition.model,
          updatedAt: nowIso,
          overwriteApplied: false,
          promptId: promptMetadata.id,
          promptPath: promptMetadata.path,
          promptSourceType: promptMetadata.type,
          lastError: undefined
        };

    const next: AssetMetadata = {
      ...metadata,
      recognized: nextRecognized,
      providerPayload: {
        ...metadata.providerPayload,
        analysis: recognition.raw,
        vision: recognition.raw
      },
      status: {
        ...metadata.status,
        recognition: 'succeeded'
      },
      timestamps: {
        ...metadata.timestamps,
        updatedAt: nowIso
      }
    };

    return this.resolvePresentationFields(next);
  }

  public markRecognitionFailure(
    metadata: AssetMetadata,
    nowIso: string,
    error: string,
    promptMetadata?: AnalysisPromptMetadata
  ): AssetMetadata {
    return {
      ...metadata,
      recognized: {
        ...metadata.recognized,
        promptId: promptMetadata?.id ?? metadata.recognized?.promptId,
        promptPath: promptMetadata?.path ?? metadata.recognized?.promptPath,
        promptSourceType: promptMetadata?.type ?? metadata.recognized?.promptSourceType,
        lastError: error,
        updatedAt: nowIso
      },
      extra: {
        ...metadata.extra,
        lastRecognitionError: error
      },
      status: {
        ...metadata.status,
        recognition: 'failed'
      },
      timestamps: {
        ...metadata.timestamps,
        updatedAt: nowIso
      }
    };
  }

  public applyThumbnail(
    metadata: AssetMetadata,
    thumbnailFilename: string,
    format: string,
    width: number,
    height: number,
    nowIso: string
  ): AssetMetadata {
    return {
      ...metadata,
      paths: {
        ...metadata.paths,
        thumbnail: thumbnailFilename
      },
      extra: {
        ...metadata.extra,
        thumbnail: {
          format,
          width,
          height
        }
      },
      status: {
        ...metadata.status,
        thumbnail: 'succeeded'
      },
      timestamps: {
        ...metadata.timestamps,
        updatedAt: nowIso
      }
    };
  }

  public markThumbnailFailure(metadata: AssetMetadata, nowIso: string, error: string): AssetMetadata {
    return {
      ...metadata,
      extra: {
        ...metadata.extra,
        lastThumbnailError: error
      },
      status: {
        ...metadata.status,
        thumbnail: 'failed'
      },
      timestamps: {
        ...metadata.timestamps,
        updatedAt: nowIso
      }
    };
  }

  public async load(assetDir: string): Promise<AssetMetadata> {
    const metadataPath = path.join(assetDir, 'metadata.json');
    const raw = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(raw) as AssetMetadata;
  }

  public async save(assetDir: string, metadata: AssetMetadata): Promise<string> {
    const metadataPath = path.join(assetDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    return metadataPath;
  }

  public resolvePresentationFields(metadata: AssetMetadata): AssetMetadata {
    const resolvedTitle = metadata.manual?.title ?? metadata.recognized?.title ?? metadata.generated.title ?? metadata.title;
    const resolvedTags = dedupeStrings(
      metadata.manual?.tags?.length
        ? metadata.manual.tags
        : metadata.recognized?.tags?.length
          ? metadata.recognized.tags
          : metadata.generated.tags ?? metadata.tags
    );
    const resolvedDescription = metadata.manual?.description ?? metadata.recognized?.description ?? metadata.description;

    return {
      ...metadata,
      title: resolvedTitle,
      tags: resolvedTags,
      description: resolvedDescription
    };
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
