import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';
import { requireImageProviderConfig } from '../providers/image-api-provider.js';
import { requireVisionProviderConfig } from '../providers/vision-api-provider.js';

describe('config loading', () => {
  it('loads defaults without provider URLs', () => {
    const config = loadConfig(process.cwd(), {});

    expect(config.outputDir).toBe('./library');
    expect(config.thumbnail.size).toBe(512);
    expect(config.imageApi).toBeUndefined();
    expect(config.visionApi).toBeUndefined();
  });

  it('parses provider config when environment variables are present', () => {
    const config = loadConfig(process.cwd(), {
      IMGBIN_IMAGE_API_URL: 'https://example.com/image',
      IMGBIN_IMAGE_API_TIMEOUT_MS: '1234',
      IMGBIN_VISION_API_URL: 'https://example.com/vision'
    });

    expect(config.imageApi?.url).toBe('https://example.com/image');
    expect(config.imageApi?.timeoutMs).toBe(1234);
    expect(config.visionApi?.url).toBe('https://example.com/vision');
  });

  it('throws a descriptive error when image provider config is required but missing', () => {
    expect(() => requireImageProviderConfig(undefined)).toThrow(/IMGBIN_IMAGE_API_URL/);
    expect(() => requireVisionProviderConfig(undefined)).toThrow(/IMGBIN_VISION_API_URL/);
  });
});
