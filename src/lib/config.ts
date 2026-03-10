import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import {
  imageProviderConfigSchema,
  thumbnailConfigSchema,
  visionProviderConfigSchema
} from './schema.js';

export interface ProviderRuntimeConfig {
  url: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface AppConfig {
  outputDir: string;
  thumbnail: {
    size: number;
    format: 'webp' | 'png' | 'jpeg';
    quality: number;
  };
  imageApi?: ProviderRuntimeConfig;
  visionApi?: ProviderRuntimeConfig;
}

export function loadConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotEnv({ path: path.join(cwd, '.env'), override: false, quiet: true });

  const thumbnail = thumbnailConfigSchema.parse({
    size: parseNumber(env.IMGBIN_THUMBNAIL_SIZE, 512),
    format: env.IMGBIN_THUMBNAIL_FORMAT ?? 'webp',
    quality: parseNumber(env.IMGBIN_THUMBNAIL_QUALITY, 82)
  });

  return {
    outputDir: env.IMGBIN_DEFAULT_OUTPUT_DIR ?? './library',
    thumbnail,
    imageApi: parseProviderConfig(
      env.IMGBIN_IMAGE_API_URL,
      env.IMGBIN_IMAGE_API_KEY,
      env.IMGBIN_IMAGE_API_MODEL,
      env.IMGBIN_IMAGE_API_TIMEOUT_MS,
      imageProviderConfigSchema
    ),
    visionApi: parseProviderConfig(
      env.IMGBIN_VISION_API_URL,
      env.IMGBIN_VISION_API_KEY,
      env.IMGBIN_VISION_API_MODEL,
      env.IMGBIN_VISION_API_TIMEOUT_MS,
      visionProviderConfigSchema
    )
  };
}

function parseProviderConfig(
  url: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  timeoutMsRaw: string | undefined,
  schema: typeof imageProviderConfigSchema | typeof visionProviderConfigSchema
): ProviderRuntimeConfig | undefined {
  if (!url) {
    return undefined;
  }

  return schema.parse({
    url,
    apiKey,
    model,
    timeoutMs: parseNumber(timeoutMsRaw, 60000)
  });
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
