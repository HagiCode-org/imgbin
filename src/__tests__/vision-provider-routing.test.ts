import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexMetadataProvider } from '../providers/codex-metadata-provider.js';
import { HttpVisionRecognitionProvider } from '../providers/vision-api-provider.js';
import { createPngBuffer, createTempDir } from './helpers.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function createRecognitionRequest(filePath: string) {
  return {
    buffer: Buffer.from('png-bits'),
    mimeType: 'image/png',
    prompt: 'Return strict JSON.',
    promptMetadata: {
      id: 'default-analysis-prompt.txt',
      path: '/tmp/default-analysis-prompt.txt',
      type: 'default' as const
    },
    filePath,
    filenameHint: 'admin-dashboard.png',
    filenameHintSource: 'source.originalPath' as const,
    recognitionContext: {
      assetId: 'asset-1',
      assetDir: path.dirname(filePath),
      slug: 'admin-dashboard',
      selectedScene: 'admin-ui' as const,
      sceneHints: [{ type: 'admin-ui' as const, reason: 'dashboard keyword', confidence: 'high' as const }],
      retry: {
        attempt: 1,
        maxAttempts: 2,
        mode: 'initial' as const
      }
    }
  };
}

describe('vision provider adapters', () => {
  it('sends the normalized HTTP request payload', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          title: 'Admin Dashboard',
          tags: ['admin-ui', 'dashboard'],
          description: 'A settings dashboard.'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new HttpVisionRecognitionProvider({
      url: 'https://example.com/vision',
      apiKey: 'vision-key',
      model: 'vision-model',
      timeoutMs: 5000
    });

    const filePath = path.join('/tmp', 'admin-dashboard.png');
    const result = await provider.recognizeImage(createRecognitionRequest(filePath));

    expect(result.provider).toBe('http-vision-api');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.prompt).toContain('Return strict JSON.');
    expect(body.filenameHint).toBe('admin-dashboard.png');
    expect(body.recognitionContext.selectedScene).toBe('admin-ui');
  });

  it('forwards local images to Codex exec and parses structured JSON events', async () => {
    const dir = await createTempDir('imgbin-codex-provider-');
    cleanupDirs.push(dir);
    const scriptPath = path.join(dir, 'fake-codex.mjs');
    const filePath = path.join(dir, 'ui.png');
    const recordPath = path.join(dir, 'record.json');
    await fs.writeFile(filePath, await createPngBuffer());
    await fs.writeFile(
      scriptPath,
      `#!/usr/bin/env node
import { promises as fs } from 'node:fs';

const args = process.argv.slice(2);
const imageIndex = args.indexOf('--image');
const schemaIndex = args.indexOf('--output-schema');
const prompt = await new Promise((resolve) => {
  let text = '';
  process.stdin.on('data', (chunk) => {
    text += chunk.toString('utf8');
  });
  process.stdin.on('end', () => resolve(text));
});

await fs.writeFile(${JSON.stringify(recordPath)}, JSON.stringify({
  args,
  prompt,
  schemaExistsDuringRun: schemaIndex >= 0 ? await fs.access(args[schemaIndex + 1]).then(() => true).catch(() => false) : false,
  imagePath: imageIndex >= 0 ? args[imageIndex + 1] : null
}, null, 2), 'utf8');

process.stdout.write(JSON.stringify({
  type: 'item.completed',
  item: {
    type: 'agent_message',
    text: JSON.stringify({
      title: 'Codex Admin Dashboard',
      tags: ['admin-ui', 'settings-panel'],
      description: 'A codex-analyzed admin settings dashboard.'
    })
  }
}) + '\\n');
`,
      'utf8'
    );
    await fs.chmod(scriptPath, 0o755);

    const provider = new CodexMetadataProvider({
      executable: scriptPath,
      model: 'gpt-5-codex',
      timeoutMs: 5000
    });

    const result = await provider.recognizeImage(createRecognitionRequest(filePath));
    const recorded = JSON.parse(await fs.readFile(recordPath, 'utf8')) as {
      args: string[];
      prompt: string;
      schemaExistsDuringRun: boolean;
      imagePath: string;
    };

    expect(result.title).toBe('Codex Admin Dashboard');
    expect(recorded.args).toContain('exec');
    expect(recorded.args).toContain('--image');
    expect(recorded.imagePath).toBe(filePath);
    expect(recorded.schemaExistsDuringRun).toBe(true);
    expect(recorded.prompt).toContain('Scene profile');
  });
});
