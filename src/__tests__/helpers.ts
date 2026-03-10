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
      raw: { prompt: input.prompt }
    };
  }
}

export class FakeVisionProvider implements VisionRecognitionProvider {
  public constructor(private readonly options: { shouldFail?: boolean } = {}) {}

  public async recognizeImage(_input: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    if (this.options.shouldFail) {
      throw new Error('Synthetic vision failure');
    }

    return {
      title: 'Recognized Sunset Panel',
      tags: ['sunset', 'panel', 'ui'],
      description: 'A warm interface composition.',
      provider: 'fake-vision-provider',
      model: 'fake-vision-model',
      raw: { ok: true }
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
