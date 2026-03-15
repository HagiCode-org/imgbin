import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import { docsPromptSourceSchema } from '../lib/schema.js';
import type { LoadedAnalysisContext, LoadedAnalysisPrompt, NormalizedGenerationInput } from '../types.js';

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

  public async loadAnalysisContext(contextText?: string, contextFile?: string): Promise<LoadedAnalysisContext | undefined> {
    if (contextText && contextFile) {
      throw new AppError('Provide either analysis context text or an analysis context file, not both.', 2);
    }

    if (contextText?.trim()) {
      return {
        text: contextText.trim(),
        metadata: {
          type: 'inline',
          preview: createContextPreview(contextText)
        }
      };
    }

    if (!contextFile) {
      return undefined;
    }

    const resolvedPath = path.resolve(contextFile);
    const text = (await fs.readFile(resolvedPath, 'utf8')).trim();

    if (!text) {
      throw new AppError(`Analysis context file is empty: ${resolvedPath}`, 2);
    }

    return {
      text,
      metadata: {
        type: 'file',
        path: resolvedPath,
        preview: createContextPreview(text)
      }
    };
  }

  public async requireAnalysisContext(contextText?: string, contextFile?: string): Promise<LoadedAnalysisContext> {
    const loaded = await this.loadAnalysisContext(contextText, contextFile);
    if (!loaded) {
      throw new AppError(
        'Analysis context is required. Provide --analysis-context or --analysis-context-file for image recognition.',
        2
      );
    }

    return loaded;
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function createContextPreview(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}
