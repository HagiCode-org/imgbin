import { AppError } from '../lib/errors.js';
import type { ProviderRuntimeConfig } from '../lib/config.js';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from '../types.js';

export class HttpImageGenerationProvider implements ImageGenerationProvider {
  public constructor(private readonly config: ProviderRuntimeConfig) {}

  public async createImage(input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const response = await fetchWithTimeout(
      this.config.url,
      {
        method: 'POST',
        headers: buildHeaders(this.config.apiKey),
        body: JSON.stringify({
          prompt: input.prompt,
          model: input.model ?? this.config.model,
          tags: input.tags ?? []
        })
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new AppError(`Image API request failed with status ${response.status}.`, 2);
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    if (contentType.startsWith('image/')) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: contentType,
        provider: 'http-image-api',
        model: input.model ?? this.config.model,
        requestId: response.headers.get('x-request-id') ?? undefined
      };
    }

    const payload = (await response.json()) as {
      imageBase64?: string;
      imageUrl?: string;
      mimeType?: string;
      requestId?: string;
      model?: string;
    };

    if (payload.imageBase64) {
      return {
        buffer: Buffer.from(payload.imageBase64, 'base64'),
        mimeType: payload.mimeType ?? 'image/png',
        provider: 'http-image-api',
        model: payload.model ?? input.model ?? this.config.model,
        requestId: payload.requestId,
        raw: payload
      };
    }

    if (payload.imageUrl) {
      const fileResponse = await fetchWithTimeout(payload.imageUrl, {}, this.config.timeoutMs);
      if (!fileResponse.ok) {
        throw new AppError(`Image download failed with status ${fileResponse.status}.`, 2);
      }
      return {
        buffer: Buffer.from(await fileResponse.arrayBuffer()),
        mimeType: fileResponse.headers.get('content-type') ?? payload.mimeType ?? 'image/png',
        provider: 'http-image-api',
        model: payload.model ?? input.model ?? this.config.model,
        requestId: payload.requestId,
        raw: payload
      };
    }

    throw new AppError('Image API response did not include image bytes, imageBase64, or imageUrl.', 2);
  }
}

export function requireImageProviderConfig(config: ProviderRuntimeConfig | undefined): ProviderRuntimeConfig {
  if (!config) {
    throw new AppError('Image API is not configured. Set IMGBIN_IMAGE_API_URL to use generate or batch image creation.', 2);
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
