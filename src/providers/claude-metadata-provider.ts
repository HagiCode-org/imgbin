import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AnalysisCliRuntimeConfig } from '../lib/config.js';
import { AppError, RecognitionError } from '../lib/errors.js';
import type { VisionRecognitionProvider, VisionRecognitionRequest, VisionRecognitionResult } from '../types.js';
import { buildProviderPrompt, parseRecognitionJson } from './vision-provider-utils.js';

export class ClaudeMetadataProvider implements VisionRecognitionProvider {
  public constructor(private readonly config: AnalysisCliRuntimeConfig) {}

  public async recognizeImage(input: VisionRecognitionRequest): Promise<VisionRecognitionResult> {
    if (!this.config.model) {
      throw new RecognitionError(
        'Claude analysis model is not configured. Set IMGBIN_ANALYSIS_API_MODEL or ANTHROPIC_MODEL.',
        'provider-resolution'
      );
    }

    const prompt = buildProviderPrompt(
      input.prompt,
      input,
      [
        `Analyze the local image file at this absolute path: ${input.filePath}`,
        'Inspect the image directly from the filesystem and return JSON only.'
      ].join('\n')
    );
    const stdout = await runClaudeCli(this.config.executable, prompt, this.config.model, this.config.timeoutMs, path.dirname(input.filePath));
    const payload = parseRecognitionJson(stdout, 'Claude CLI');

    return {
      title: payload.title,
      tags: payload.tags ?? [],
      description: payload.description,
      provider: 'claude-cli',
      model: this.config.model,
      raw: payload
    };
  }
}

function runClaudeCli(
  executable: string,
  prompt: string,
  model: string,
  timeoutMs: number,
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-p', prompt, '--model', model], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: process.env.PATH
      }
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new AppError(`Claude CLI analysis timed out after ${timeoutMs}ms.`, 2));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new AppError(`Failed to start Claude CLI (${executable}): ${error.message}`, 2));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new AppError(`Claude CLI exited with code ${code}: ${stderr || stdout}`.trim(), 2));
        return;
      }

      if (!stdout.trim()) {
        reject(new AppError('Claude CLI returned an empty response.', 2));
        return;
      }

      resolve(stdout.trim());
    });
  });
}
