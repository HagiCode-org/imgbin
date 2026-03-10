import { z } from 'zod';

export const imageProviderConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().default(60000)
});

export const visionProviderConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().default(60000)
});

export const thumbnailConfigSchema = z.object({
  size: z.number().int().positive().default(512),
  format: z.enum(['webp', 'png', 'jpeg']).default('webp'),
  quality: z.number().int().min(1).max(100).default(82)
});

export const batchJobSchema = z.object({
  prompt: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  output: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  annotate: z.boolean().default(false),
  thumbnail: z.boolean().default(false),
  assetPath: z.string().min(1).optional(),
  overwriteRecognition: z.boolean().default(false)
}).refine((value) => Boolean(value.prompt || value.assetPath), {
  message: 'Each batch job must provide either prompt or assetPath.'
});

export const batchManifestSchema = z.union([
  z.object({ jobs: z.array(batchJobSchema).min(1) }),
  z.array(batchJobSchema).min(1).transform((jobs) => ({ jobs }))
]);
