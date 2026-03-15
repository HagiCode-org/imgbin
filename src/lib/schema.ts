import { z } from 'zod';

export const analysisProviderSchema = z.enum(['claude', 'codex', 'http']);

export const imageProviderConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().default(60000)
});

export const analysisCliConfigSchema = z.object({
  executable: z.string().min(1).default('claude'),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().default(60000)
});

export const codexCliConfigSchema = analysisCliConfigSchema.extend({
  executable: z.string().min(1).default('codex'),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional()
});

export const thumbnailConfigSchema = z.object({
  size: z.number().int().positive().default(512),
  format: z.enum(['webp', 'png', 'jpeg']).default('webp'),
  quality: z.number().int().min(1).max(100).default(82)
});

export const docsPromptSourceSchema = z.object({
  _comment: z.string().optional(),
  basePrompt: z.string().optional(),
  context: z.string().optional(),
  customPrompt: z.string().optional(),
  userPrompt: z.string().min(1),
  generationParams: z.record(z.string(), z.unknown()).optional(),
  _metadata: z.record(z.string(), z.unknown()).optional()
});

export const batchJobSchema = z
  .object({
    prompt: z.string().min(1).optional(),
    promptFile: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).default([]),
    annotate: z.boolean().optional(),
    thumbnail: z.boolean().default(false),
    assetPath: z.string().min(1).optional(),
    importTo: z.string().min(1).optional(),
    overwriteRecognition: z.boolean().default(false),
    analysisPromptPath: z.string().min(1).optional(),
    analysisContext: z.string().min(1).optional(),
    analysisContextFile: z.string().min(1).optional(),
    pendingLibrary: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    const modeCount = [value.prompt, value.promptFile, value.assetPath, value.pendingLibrary].filter(Boolean).length;
    if (modeCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each batch job must provide prompt, promptFile, assetPath, or pendingLibrary.'
      });
    }

    if (value.prompt && value.promptFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Batch jobs cannot provide both prompt and promptFile.'
      });
    }

    if (value.analysisContext && value.analysisContextFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Batch jobs cannot provide both analysisContext and analysisContextFile.'
      });
    }

    if (value.pendingLibrary && modeCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pendingLibrary jobs cannot be combined with prompt, promptFile, or assetPath.'
      });
    }

    const runsRecognition =
      Boolean(value.pendingLibrary) ||
      Boolean(value.importTo) ||
      Boolean((value.prompt || value.promptFile) && value.annotate) ||
      Boolean(value.assetPath && !(value.thumbnail && !value.importTo && value.annotate === false));

    if (runsRecognition && !value.analysisContext && !value.analysisContextFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Recognition jobs must provide analysisContext or analysisContextFile.'
      });
    }
  });

export const batchManifestSchema = z.union([
  z.object({ jobs: z.array(batchJobSchema).min(1) }),
  z.array(batchJobSchema).min(1).transform((jobs) => ({ jobs }))
]);
