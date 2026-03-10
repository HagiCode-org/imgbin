import path from 'node:path';
import { loadConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { requireImageProviderConfig, HttpImageGenerationProvider } from '../providers/image-api-provider.js';
import { requireVisionProviderConfig, HttpVisionRecognitionProvider } from '../providers/vision-api-provider.js';
import { AssetWriter } from '../services/asset-writer.js';
import { JobRunner } from '../services/job-runner.js';
import { ManifestLoader } from '../services/manifest-loader.js';
import { MetadataService } from '../services/metadata.js';
import { ThumbnailService } from '../services/thumbnail.js';
import type { ImageGenerationProvider, VisionRecognitionProvider } from '../types.js';

export interface RuntimeOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  imageProvider?: ImageGenerationProvider;
  visionProvider?: VisionRecognitionProvider;
}

export interface CliRuntime {
  cwd: string;
  config: AppConfig;
  logger: Logger;
  manifestLoader: ManifestLoader;
  jobRunner: JobRunner;
}

export function createRuntime(options: RuntimeOptions = {}): CliRuntime {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig(cwd, options.env);
  const logger = options.logger ?? createLogger();
  const assetWriter = new AssetWriter();
  const metadataService = new MetadataService();
  const thumbnailService = new ThumbnailService();

  const imageProvider = options.imageProvider ?? (config.imageApi ? new HttpImageGenerationProvider(requireImageProviderConfig(config.imageApi)) : undefined);
  const visionProvider = options.visionProvider ?? (config.visionApi ? new HttpVisionRecognitionProvider(requireVisionProviderConfig(config.visionApi)) : undefined);

  return {
    cwd,
    config: {
      ...config,
      outputDir: path.resolve(cwd, config.outputDir)
    },
    logger,
    manifestLoader: new ManifestLoader(),
    jobRunner: new JobRunner({
      imageProvider,
      visionProvider,
      assetWriter,
      metadataService,
      thumbnailService,
      thumbnailConfig: config.thumbnail,
      now: () => new Date()
    })
  };
}
