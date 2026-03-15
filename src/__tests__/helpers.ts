import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
  VisionRecognitionProvider,
  VisionRecognitionRequest,
  VisionRecognitionResult
} from '../types.js';

export class FakeImageProvider implements ImageGenerationProvider {
  public constructor(private readonly options: { failPrompts?: Set<string> } = {}) {}

  public async createImage(input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (this.options.failPrompts?.has(input.prompt)) {
      throw new Error(`Synthetic image failure for prompt: ${input.prompt}`);
    }

    return {
      buffer: await createPngBuffer(),
      mimeType: 'image/png',
      provider: 'fake-image-provider',
      model: input.model ?? 'fake-image-model',
      raw: {
        prompt: input.prompt,
        generationParams: input.generationParams,
        promptSource: input.promptSource
      }
    };
  }
}

export class FakeVisionProvider implements VisionRecognitionProvider {
  public readonly calls: VisionRecognitionRequest[] = [];

  public constructor(
    private readonly options: {
      shouldFail?: boolean;
      responses?: VisionRecognitionResult[];
      handler?: (input: VisionRecognitionRequest, index: number) => VisionRecognitionResult | Promise<VisionRecognitionResult>;
    } = {}
  ) {}

  public async recognizeImage(input: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    this.calls.push(input);
    const callIndex = this.calls.length - 1;

    if (this.options.shouldFail) {
      throw new Error('Synthetic vision failure');
    }

    if (this.options.handler) {
      return this.options.handler(input, callIndex);
    }

    const scriptedResponse = this.options.responses?.[callIndex];
    if (scriptedResponse) {
      return scriptedResponse;
    }

    return {
      title: 'Recognized Sunset Panel',
      tags: ['sunset', 'panel', 'ui'],
      description: 'A warm interface composition.',
      provider: 'claude-cli',
      model: input.model ?? 'fake-vision-model',
      sceneType: input.recognitionContext.selectedScene,
      raw: { ok: true, promptId: input.promptMetadata.id, filePath: input.filePath, scene: input.recognitionContext.selectedScene }
    };
  }
}

export async function createTempDir(prefix = 'imgbin-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 48,
      height: 48,
      channels: 3,
      background: { r: 255, g: 128, b: 0 }
    }
  })
    .png()
    .toBuffer();
}
