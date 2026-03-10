import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import { docsPromptSourceSchema } from '../lib/schema.js';
import type { LoadedAnalysisPrompt, NormalizedGenerationInput } from '../types.js';

export class PromptSourceLoader {
  public async loadGenerationInput(input: { prompt?: string; promptFile?: string; tags?: string[] }): Promise<NormalizedGenerationInput> {
    if (input.prompt && input.promptFile) {
      throw new AppError('Provide either --prompt or --prompt-file, not both.', 2);
    }

    if (input.prompt) {
      return {
        prompt: input.prompt,
        tags: dedupeStrings(input.tags ?? []),
        promptSource: {
          type: 'raw'
        }
      };
    }

    if (!input.promptFile) {
      throw new AppError('A prompt source is required. Provide --prompt or --prompt-file.', 2);
    }

    const resolvedPath = path.resolve(input.promptFile);
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const parsed = docsPromptSourceSchema.parse(JSON.parse(raw));

    return {
      prompt: parsed.userPrompt,
      tags: dedupeStrings(input.tags ?? []),
      promptSource: {
        type: 'docs-prompt-file',
        path: resolvedPath,
        context: parsed.context?.trim() || undefined,
        generationParams: parsed.generationParams,
        metadata: parsed._metadata
      },
      generationParams: parsed.generationParams
    };
  }

  public async loadAnalysisPrompt(defaultPath: string, overridePath?: string): Promise<LoadedAnalysisPrompt> {
    const resolvedPath = path.resolve(overridePath ?? defaultPath);
    const text = (await fs.readFile(resolvedPath, 'utf8')).trim();

    if (!text) {
      throw new AppError(`Analysis prompt is empty: ${resolvedPath}`, 2);
    }

    return {
      text,
      metadata: {
        type: overridePath ? 'file' : 'default',
        id: path.basename(resolvedPath),
        path: resolvedPath
      }
    };
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
