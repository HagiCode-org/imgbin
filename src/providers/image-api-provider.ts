import { AppError } from '../lib/errors.js';
import type { ProviderRuntimeConfig } from '../lib/config.js';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from '../types.js';

export class HttpImageGenerationProvider implements ImageGenerationProvider {
  public constructor(private readonly config: ProviderRuntimeConfig) {}

  public async createImage(input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const generationParams = input.generationParams ?? {};
    const size = readStringParam(generationParams.size) ?? '1024x1024';
    const quality = readStringParam(generationParams.quality) ?? 'high';
    const format = readStringParam(generationParams.format) ?? 'png';

    const response = await fetchWithTimeout(
      this.config.url,
      {
        method: 'POST',
        headers: buildHeaders(this.config.apiKey),
        body: JSON.stringify({
          prompt: input.prompt,
          size,
          quality,
          output_compression: 100,
          output_format: format,
          n: 1
        })
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      const errorBody = await safeReadText(response);
      throw new AppError(
        `Image API request failed with status ${response.status}.${errorBody ? ` Response: ${errorBody}` : ''}`,
        2
      );
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    if (contentType.startsWith('image/')) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: contentType,
        provider: 'azure-openai-image-api',
        model: input.model ?? this.config.model,
        requestId: response.headers.get('x-request-id') ?? undefined
      };
    }

    const payload = (await response.json()) as {
      data?: Array<{
        b64_json?: string;
      }>;
      imageBase64?: string;
      imageUrl?: string;
      mimeType?: string;
      requestId?: string;
      model?: string;
    };

    const azureBase64 = payload.data?.[0]?.b64_json;
    if (azureBase64) {
      const sanitizedPayload = sanitizeImagePayload(payload);
      return {
        buffer: Buffer.from(azureBase64, 'base64'),
        mimeType: payload.mimeType ?? mimeTypeFromFormat(format),
        provider: 'azure-openai-image-api',
        model: payload.model ?? input.model ?? this.config.model,
        requestId: payload.requestId ?? response.headers.get('x-request-id') ?? undefined,
        raw: sanitizedPayload
      };
    }

    if (payload.imageBase64) {
      const sanitizedPayload = sanitizeImagePayload(payload);
      return {
        buffer: Buffer.from(payload.imageBase64, 'base64'),
        mimeType: payload.mimeType ?? 'image/png',
        provider: 'azure-openai-image-api',
        model: payload.model ?? input.model ?? this.config.model,
        requestId: payload.requestId,
        raw: sanitizedPayload
      };
    }

    if (payload.imageUrl) {
      const fileResponse = await fetchWithTimeout(payload.imageUrl, {}, this.config.timeoutMs);
      if (!fileResponse.ok) {
        throw new AppError(`Image download failed with status ${fileResponse.status}.`, 2);
      }
      const sanitizedPayload = sanitizeImagePayload(payload);
      return {
        buffer: Buffer.from(await fileResponse.arrayBuffer()),
        mimeType: fileResponse.headers.get('content-type') ?? payload.mimeType ?? 'image/png',
        provider: 'azure-openai-image-api',
        model: payload.model ?? input.model ?? this.config.model,
        requestId: payload.requestId,
        raw: sanitizedPayload
      };
    }

    throw new AppError('Image API response did not include Azure `data[0].b64_json`, image bytes, imageBase64, or imageUrl.', 2);
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

function readStringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mimeTypeFromFormat(format: string): string {
  if (format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }
  if (format === 'webp') {
    return 'image/webp';
  }
  return 'image/png';
}

function sanitizeImagePayload(payload: {
  data?: Array<{
    b64_json?: string;
    [key: string]: unknown;
  }>;
  imageBase64?: string;
  [key: string]: unknown;
}): Record<string, unknown> {
  const { imageBase64: _imageBase64, data, ...rest } = payload;

  return {
    ...rest,
    ...(Array.isArray(data)
      ? {
          data: data.map(({ b64_json: _b64Json, ...item }) => item)
        }
      : {})
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text.length > 400 ? `${text.slice(0, 400)}...` : text;
  } catch {
    return '';
  }
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
