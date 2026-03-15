import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { CodexCliRuntimeConfig } from '../lib/config.js';
import { AppError } from '../lib/errors.js';
import type { VisionRecognitionProvider, VisionRecognitionRequest, VisionRecognitionResult } from '../types.js';
import { buildProviderPrompt, parseRecognitionJson } from './vision-provider-utils.js';

const CODEX_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    description: { type: 'string' }
  },
  required: ['title', 'tags', 'description'],
  additionalProperties: false
} as const;

export class CodexMetadataProvider implements VisionRecognitionProvider {
  public constructor(private readonly config: CodexCliRuntimeConfig) {}

  public async recognizeImage(input: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    const prompt = buildProviderPrompt(
      input.prompt,
      input,
      [
        `The image is attached from the local filesystem via --image: ${input.filePath}`,
        'Inspect the attached image directly and return JSON only.'
      ].join('\n')
    );

    const stdout = await runCodexCli(this.config, prompt, input.filePath);
    const payload = parseRecognitionJson(extractCodexResponse(stdout), 'Codex CLI');

    return {
      title: payload.title,
      tags: payload.tags ?? [],
      description: payload.description,
      provider: 'codex-cli',
      model: this.config.model,
      raw: payload
    };
  }
}

async function runCodexCli(config: CodexCliRuntimeConfig, prompt: string, filePath: string): Promise<string> {
  const schemaPath = await writeTempSchemaFile();
  try {
    return await new Promise((resolve, reject) => {
      const args = ['exec', '--experimental-json', '--skip-git-repo-check', '--output-schema', schemaPath, '--image', filePath];
      if (config.model) {
        args.push('--model', config.model);
      }

      const child = spawn(config.executable, args, {
        cwd: path.dirname(filePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(config.baseUrl ? { OPENAI_BASE_URL: config.baseUrl } : {}),
          ...(config.apiKey ? { CODEX_API_KEY: config.apiKey } : {})
        }
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new AppError(`Codex CLI analysis timed out after ${config.timeoutMs}ms.`, 2));
      }, config.timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(new AppError(`Failed to start Codex CLI (${config.executable}): ${error.message}`, 2));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new AppError(`Codex CLI exited with code ${code}: ${stderr || stdout}`.trim(), 2));
          return;
        }

        if (!stdout.trim()) {
          reject(new AppError('Codex CLI returned an empty response.', 2));
          return;
        }

        resolve(stdout.trim());
      });

      child.stdin?.write(prompt);
      child.stdin?.end();
    });
  } finally {
    await fs.rm(schemaPath, { force: true });
  }
}

async function writeTempSchemaFile(): Promise<string> {
  const schemaPath = path.join(os.tmpdir(), `imgbin-codex-schema-${process.pid}-${Date.now()}.json`);
  await fs.writeFile(schemaPath, JSON.stringify(CODEX_OUTPUT_SCHEMA, null, 2), 'utf8');
  return schemaPath;
}

function extractCodexResponse(stdout: string): string {
  let finalText = '';

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        item?: {
          type?: string;
          text?: string;
        };
      };
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        finalText = event.item.text;
      }
    } catch {
      finalText = trimmed;
    }
  }

  return finalText || stdout;
}
