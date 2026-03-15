import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime } from '../lib/runtime.js';
import { createVisionProvider } from '../providers/vision-provider-factory.js';
import { CodexMetadataProvider } from '../providers/codex-metadata-provider.js';
import { HttpVisionRecognitionProvider } from '../providers/vision-api-provider.js';
import { createTempDir, FakeImageProvider, FakeVisionProvider } from './helpers.js';

const cleanupDirs: string[] = [];
const DEFAULT_ANALYSIS_CONTEXT = 'Runtime test context: this is a managed UI screenshot.';

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map(async (dir) => {
      const { promises: fs } = await import('node:fs');
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe('runtime provider routing', () => {
  it('creates a Codex provider when IMGBIN_ANALYSIS_PROVIDER=codex', async () => {
    const cwd = await createTempDir('imgbin-runtime-');
    cleanupDirs.push(cwd);

    const runtime = createRuntime({
      cwd,
      env: {
        IMGBIN_ANALYSIS_PROVIDER: 'codex',
        IMGBIN_CODEX_CLI_PATH: '/usr/local/bin/codex'
      }
    });

    const provider = createVisionProvider(runtime.config);
    expect(provider).toBeInstanceOf(CodexMetadataProvider);
  });

  it('creates an HTTP vision provider when explicitly configured', async () => {
    const cwd = await createTempDir('imgbin-runtime-');
    cleanupDirs.push(cwd);

    const runtime = createRuntime({
      cwd,
      env: {
        IMGBIN_ANALYSIS_PROVIDER: 'http',
        IMGBIN_VISION_API_URL: 'https://example.com/vision'
      }
    });

    const provider = createVisionProvider(runtime.config);
    expect(provider).toBeInstanceOf(HttpVisionRecognitionProvider);
  });

  it('preserves fake vision provider injection for automation', async () => {
    const cwd = await createTempDir('imgbin-runtime-');
    cleanupDirs.push(cwd);
    const fakeProvider = new FakeVisionProvider();
    const outputDir = await createTempDir('imgbin-runtime-output-');
    cleanupDirs.push(outputDir);

    const runtime = createRuntime({
      cwd,
      env: {
        IMGBIN_ANALYSIS_PROVIDER: 'codex',
        IMGBIN_CODEX_CLI_PATH: '/usr/local/bin/codex'
      },
      imageProvider: new FakeImageProvider(),
      visionProvider: fakeProvider
    });

    const result = await runtime.jobRunner.generate({
      prompt: 'runtime injection',
      output: outputDir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(true);
    expect(fakeProvider.calls).toHaveLength(1);
  });

  it('surfaces provider resolution failures without deleting generated assets', async () => {
    const cwd = await createTempDir('imgbin-runtime-');
    cleanupDirs.push(cwd);
    const outputDir = await createTempDir('imgbin-runtime-output-');
    cleanupDirs.push(outputDir);

    const runtime = createRuntime({
      cwd,
      env: {
        IMGBIN_ANALYSIS_PROVIDER: 'http'
      },
      imageProvider: new FakeImageProvider()
    });

    const result = await runtime.jobRunner.generate({
      prompt: 'provider resolution failure',
      output: outputDir,
      tags: [],
      annotate: true,
      analysisContext: DEFAULT_ANALYSIS_CONTEXT,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(false);
    expect(result.assetDir).toBeTruthy();
    expect(result.steps?.find((step) => step.step === 'recognition')?.message).toBe(
      'Metadata analysis failed during provider resolution'
    );
  });

  it('fails recognition validation when analysis context is missing', async () => {
    const cwd = await createTempDir('imgbin-runtime-');
    cleanupDirs.push(cwd);
    const outputDir = await createTempDir('imgbin-runtime-output-');
    cleanupDirs.push(outputDir);

    const runtime = createRuntime({
      cwd,
      env: {
        IMGBIN_ANALYSIS_PROVIDER: 'codex',
        IMGBIN_CODEX_CLI_PATH: '/usr/local/bin/codex'
      },
      imageProvider: new FakeImageProvider(),
      visionProvider: new FakeVisionProvider()
    });

    const result = await runtime.jobRunner.generate({
      prompt: 'missing analysis context',
      output: outputDir,
      tags: [],
      annotate: true,
      thumbnail: false,
      dryRun: false
    });

    expect(result.success).toBe(false);
    expect(result.steps?.find((step) => step.step === 'recognition')?.message).toBe('Metadata analysis failed validation');
  });
});
