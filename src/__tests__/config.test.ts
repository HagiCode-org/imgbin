import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';
import { requireImageProviderConfig } from '../providers/image-api-provider.js';

describe('config loading', () => {
  it('loads defaults without provider URLs', () => {
    const config = loadConfig(process.cwd(), {});

    expect(config.outputDir).toBe('./library');
    expect(config.thumbnail.size).toBe(512);
    expect(config.imageApi).toBeUndefined();
    expect(config.analysisCli.executable).toBe('claude');
    expect(config.analysisCli.model).toBeUndefined();
    expect(config.analysisPromptPath).toContain('default-analysis-prompt.txt');
  });

  it('parses provider config when environment variables are present', () => {
    const config = loadConfig(process.cwd(), {
      IMGBIN_IMAGE_API_URL: 'https://example.com/image',
      IMGBIN_IMAGE_API_TIMEOUT_MS: '1234',
      IMGBIN_ANALYSIS_CLI_PATH: '/usr/local/bin/claude',
      IMGBIN_ANALYSIS_TIMEOUT_MS: '4321',
      IMGBIN_ANALYSIS_PROMPT_PATH: './custom-analysis.txt',
      ANTHROPIC_MODEL: 'claude-sonnet-fallback'
    });

    expect(config.imageApi?.url).toBe('https://example.com/image');
    expect(config.imageApi?.timeoutMs).toBe(1234);
    expect(config.analysisCli.executable).toBe('/usr/local/bin/claude');
    expect(config.analysisCli.timeoutMs).toBe(4321);
    expect(config.analysisCli.model).toBe('claude-sonnet-fallback');
    expect(config.analysisPromptPath).toBe(path.resolve(process.cwd(), 'custom-analysis.txt'));
  });

  it('falls back to Azure-style environment variables for image generation config', () => {
    const config = loadConfig(process.cwd(), {
      AZURE_ENDPOINT: 'https://example.openai.azure.com/openai/deployments/test/images/generations?api-version=2025-04-01-preview',
      AZURE_API_KEY: 'azure-key'
    });

    expect(config.imageApi?.url).toContain('example.openai.azure.com');
    expect(config.imageApi?.apiKey).toBe('azure-key');
  });

  it('prefers the ImgBin-specific analysis model over ANTHROPIC_MODEL', () => {
    const config = loadConfig(process.cwd(), {
      IMGBIN_ANALYSIS_API_MODEL: 'imgbin-override-model',
      ANTHROPIC_MODEL: 'claude-sonnet-fallback'
    });

    expect(config.analysisCli.model).toBe('imgbin-override-model');
  });

  it('throws a descriptive error when image provider config is required but missing', () => {
    expect(() => requireImageProviderConfig(undefined)).toThrow(/IMGBIN_IMAGE_API_URL/);
  });
});
