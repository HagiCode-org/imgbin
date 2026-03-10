import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpImageGenerationProvider } from '../providers/image-api-provider.js';

describe('HttpImageGenerationProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends Azure-style image generation payload and decodes b64_json responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from('png-bits').toString('base64') }]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-123'
          }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpImageGenerationProvider({
      url: 'https://example.openai.azure.com/openai/deployments/site-image/images/generations?api-version=2025-04-01-preview',
      apiKey: 'azure-key',
      model: 'ignored-model',
      timeoutMs: 5000
    });

    const result = await provider.createImage({
      prompt: 'A hand-drawn hero card',
      generationParams: {
        size: '1024x1024',
        quality: 'high',
        format: 'png'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('images/generations');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer azure-key'
      }
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: 'A hand-drawn hero card',
      size: '1024x1024',
      quality: 'high',
      output_compression: 100,
      output_format: 'png',
      n: 1
    });
    expect(result.buffer.toString()).toBe('png-bits');
    expect(result.mimeType).toBe('image/png');
    expect(result.requestId).toBe('req-123');
    expect(result.raw).toEqual({
      data: [{}]
    });
  });

  it('includes response text in HTTP failures', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'invalid size' } }), {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpImageGenerationProvider({
      url: 'https://example.openai.azure.com/openai/deployments/site-image/images/generations?api-version=2025-04-01-preview',
      apiKey: 'azure-key',
      timeoutMs: 5000
    });

    await expect(
      provider.createImage({
        prompt: 'broken',
        generationParams: {
          size: '999x999'
        }
      })
    ).rejects.toThrow(/status 400/);
    await expect(
      provider.createImage({
        prompt: 'broken',
        generationParams: {
          size: '999x999'
        }
      })
    ).rejects.toThrow(/invalid size/);
  });
});
