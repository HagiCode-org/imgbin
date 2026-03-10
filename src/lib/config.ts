import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import {
  analysisCliConfigSchema,
  imageProviderConfigSchema,
  thumbnailConfigSchema
} from './schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ANALYSIS_PROMPT_PATH = path.resolve(moduleDir, '../../prompts/default-analysis-prompt.txt');

export interface ProviderRuntimeConfig {
  url: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface AnalysisCliRuntimeConfig {
  executable: string;
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
  analysisCli: AnalysisCliRuntimeConfig;
  analysisPromptPath: string;
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
      env.IMGBIN_IMAGE_API_URL ?? env.AZURE_ENDPOINT,
      env.IMGBIN_IMAGE_API_KEY ?? env.AZURE_API_KEY,
      env.IMGBIN_IMAGE_API_MODEL,
      env.IMGBIN_IMAGE_API_TIMEOUT_MS,
      imageProviderConfigSchema
    ),
    analysisCli: analysisCliConfigSchema.parse({
      executable: env.IMGBIN_ANALYSIS_CLI_PATH ?? 'claude',
      model: env.IMGBIN_ANALYSIS_API_MODEL ?? env.ANTHROPIC_MODEL ?? env.IMGBIN_VISION_API_MODEL,
      timeoutMs: parseNumber(env.IMGBIN_ANALYSIS_TIMEOUT_MS ?? env.IMGBIN_ANALYSIS_API_TIMEOUT_MS, 60000)
    }),
    analysisPromptPath: resolveConfigPath(cwd, env.IMGBIN_ANALYSIS_PROMPT_PATH, DEFAULT_ANALYSIS_PROMPT_PATH)
  };
}

function parseProviderConfig(
  url: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  timeoutMsRaw: string | undefined,
  schema: typeof imageProviderConfigSchema
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

function resolveConfigPath(cwd: string, candidate: string | undefined, fallback: string): string {
  if (!candidate) {
    return fallback;
  }

  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
