import path from 'node:path';
import { loadConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { requireImageProviderConfig, HttpImageGenerationProvider } from '../providers/image-api-provider.js';
import { ClaudeMetadataProvider } from '../providers/claude-metadata-provider.js';
import { AssetWriter } from '../services/asset-writer.js';
import { JobRunner } from '../services/job-runner.js';
import { ManagedAssetScanner } from '../services/managed-asset-scanner.js';
import { ManifestLoader } from '../services/manifest-loader.js';
import { MetadataService } from '../services/metadata.js';
import { PromptSourceLoader } from '../services/prompt-source-loader.js';
import { SearchIndexService } from '../services/search-index.js';
import { SearchService } from '../services/search-service.js';
import { ThumbnailService } from '../services/thumbnail.js';
import type { ImageGenerationProvider, SearchQueryService, VisionRecognitionProvider } from '../types.js';

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
  searchService: SearchQueryService;
}

export function createRuntime(options: RuntimeOptions = {}): CliRuntime {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig(cwd, options.env);
  const logger = options.logger ?? createLogger();
  const assetWriter = new AssetWriter();
  const metadataService = new MetadataService();
  const thumbnailService = new ThumbnailService();
  const promptSourceLoader = new PromptSourceLoader();
  const managedAssetScanner = new ManagedAssetScanner();
  const searchIndexService = new SearchIndexService(metadataService);

  const imageProvider = options.imageProvider ?? (config.imageApi ? new HttpImageGenerationProvider(requireImageProviderConfig(config.imageApi)) : undefined);
  const visionProvider = options.visionProvider ?? new ClaudeMetadataProvider(config.analysisCli);

  return {
    cwd,
    config: {
      ...config,
      outputDir: path.resolve(cwd, config.outputDir)
    },
    logger,
    manifestLoader: new ManifestLoader(),
    searchService: new SearchService(searchIndexService),
    jobRunner: new JobRunner({
      imageProvider,
      visionProvider,
      assetWriter,
      metadataService,
      thumbnailService,
      promptSourceLoader,
      managedAssetScanner,
      searchIndexService,
      defaultAnalysisPromptPath: config.analysisPromptPath,
      thumbnailConfig: config.thumbnail,
      now: () => new Date()
    })
  };
}
