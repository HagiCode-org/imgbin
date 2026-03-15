import type { AppConfig } from '../lib/config.js';
import { RecognitionError } from '../lib/errors.js';
import type { VisionRecognitionProvider } from '../types.js';
import { ClaudeMetadataProvider } from './claude-metadata-provider.js';
import { CodexMetadataProvider } from './codex-metadata-provider.js';
import { HttpVisionRecognitionProvider } from './vision-api-provider.js';

export function createVisionProvider(config: AppConfig): VisionRecognitionProvider {
  switch (config.analysisProvider) {
    case 'claude':
      return new ClaudeMetadataProvider(config.analysisCli);
    case 'codex':
      return new CodexMetadataProvider(config.codexCli);
    case 'http':
      if (!config.visionApi) {
        return new FailingVisionProvider(
          new RecognitionError(
            'Vision API is not configured. Set IMGBIN_VISION_API_URL or switch IMGBIN_ANALYSIS_PROVIDER to claude/codex.',
            'provider-resolution'
          )
        );
      }
      return new HttpVisionRecognitionProvider(config.visionApi);
    default:
      return new FailingVisionProvider(
        new RecognitionError(`Unsupported analysis provider: ${String(config.analysisProvider)}`, 'provider-resolution')
      );
  }
}

class FailingVisionProvider implements VisionRecognitionProvider {
  public constructor(private readonly error: RecognitionError) {}

  public async recognizeImage(): Promise<never> {
    throw this.error;
  }
}
