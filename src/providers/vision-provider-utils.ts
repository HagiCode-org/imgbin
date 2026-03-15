import type { VisionRecognitionRequest } from '../types.js';
import { AppError } from '../lib/errors.js';

export function buildProviderPrompt(
  basePrompt: string,
  input: VisionRecognitionRequest,
  imageInstruction: string
): string {
  const sections = [basePrompt.trim()];

  sections.push(
    [
      'Scene profile:',
      `- Selected scene: ${input.recognitionContext.selectedScene}`,
      `- Attempt ${input.recognitionContext.retry.attempt} of ${input.recognitionContext.retry.maxAttempts} (${input.recognitionContext.retry.mode})`
    ].join('\n')
  );

  if (input.recognitionContext.sceneHints.length > 0) {
    sections.push(
      [
        'Scene hints (use as weak context only):',
        ...input.recognitionContext.sceneHints.map(
          (hint) => `- ${hint.type} [${hint.confidence}]: ${hint.reason}`
        )
      ].join('\n')
    );
  }

  if (input.filenameHint) {
    sections.push(
      [
        'Filename guidance (soft scene hint):',
        `- Candidate hint from ${describeFilenameHintSource(input.filenameHintSource)}: ${input.filenameHint}`,
        '- Treat this filename as an auxiliary clue, not a guaranteed fact.',
        '- If the filename conflicts with visible image evidence, trust the image.'
      ].join('\n')
    );
  }

  sections.push(imageInstruction);
  return sections.join('\n\n');
}

export function parseRecognitionJson(
  output: string,
  providerLabel: string
): { title?: string; tags?: string[]; description?: string } {
  const trimmed = output.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const jsonCandidate = firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;

  try {
    return JSON.parse(jsonCandidate) as { title?: string; tags?: string[]; description?: string };
  } catch (error) {
    throw new AppError(
      `Failed to parse ${providerLabel} JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      2
    );
  }
}

function describeFilenameHintSource(source: VisionRecognitionRequest['filenameHintSource']): string {
  switch (source) {
    case 'source.originalPath':
      return 'the imported source filename';
    case 'assetDir':
      return 'the managed asset directory name';
    case 'slug':
    default:
      return 'the managed asset slug';
  }
}
