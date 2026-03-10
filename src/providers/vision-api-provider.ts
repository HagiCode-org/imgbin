import { AppError } from '../lib/errors.js';
import type { ProviderRuntimeConfig } from '../lib/config.js';
import type { VisionRecognitionProvider, VisionRecognitionRequest, VisionRecognitionResult } from '../types.js';

export class HttpVisionRecognitionProvider implements VisionRecognitionProvider {
  public constructor(private readonly config: ProviderRuntimeConfig) {}

  public async recognizeImage(input: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    const response = await fetchWithTimeout(
      this.config.url,
      {
        method: 'POST',
        headers: buildHeaders(this.config.apiKey),
        body: JSON.stringify({
          imageBase64: input.buffer.toString('base64'),
          mimeType: input.mimeType,
          model: input.model ?? this.config.model
        })
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new AppError(`Vision API request failed with status ${response.status}.`, 2);
    }

    const payload = (await response.json()) as {
      title?: string;
      tags?: string[];
      description?: string;
      model?: string;
    };

    return {
      title: payload.title,
      tags: payload.tags ?? [],
      description: payload.description,
      provider: 'http-vision-api',
      model: payload.model ?? input.model ?? this.config.model,
      raw: payload
    };
  }
}

export function requireVisionProviderConfig(config: ProviderRuntimeConfig | undefined): ProviderRuntimeConfig {
  if (!config) {
    throw new AppError('Vision API is not configured. Set IMGBIN_VISION_API_URL to use annotate or --annotate.', 2);
  }
  return config;
}

function buildHeaders(apiKey?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AppError(`Request timed out after ${timeoutMs}ms.`, 2);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
