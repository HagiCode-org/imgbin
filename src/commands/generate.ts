import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';

interface GenerateOptions {
  prompt?: string;
  promptFile?: string;
  output?: string;
  slug?: string;
  title?: string;
  tag?: string[];
  annotate?: boolean;
  thumbnail?: boolean;
  dryRun?: boolean;
  analysisPrompt?: string;
  analysisContext?: string;
  analysisContextFile?: string;
}

export function registerGenerateCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('generate')
    .description('Generate a new image asset from raw text or a docs prompt file.')
    .option('--prompt <text>', 'Prompt used for image generation')
    .option('--prompt-file <path>', 'Path to a docs-style prompt.json file')
    .option('--output <dir>', 'Output root directory')
    .option('--slug <slug>', 'Optional asset slug override')
    .option('--title <title>', 'Optional title override')
    .option('--tag <tag>', 'Add a tag to metadata', collect, [])
    .option('--annotate', 'Run multimodal metadata analysis after generation')
    .option('--analysis-prompt <path>', 'Override the default local analysis prompt file')
    .option('--analysis-context <text>', 'Inline context that can assist multimodal metadata analysis')
    .option('--analysis-context-file <path>', 'Path to a file containing extra analysis context')
    .option('--thumbnail', 'Create a thumbnail after generation')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (options: GenerateOptions) => {
      if (!options.prompt && !options.promptFile) {
        throw new AppError('Provide either --prompt or --prompt-file.', 1);
      }
      if (options.prompt && options.promptFile) {
        throw new AppError('Provide either --prompt or --prompt-file, not both.', 1);
      }
      if (options.analysisContext && options.analysisContextFile) {
        throw new AppError('Provide either --analysis-context or --analysis-context-file, not both.', 1);
      }
      if (options.annotate && !options.analysisContext && !options.analysisContextFile) {
        throw new AppError('Annotated generation requires --analysis-context or --analysis-context-file.', 1);
      }

      const result = await runtime.jobRunner.generate({
        prompt: options.prompt,
        promptFile: options.promptFile,
        output: options.output ?? runtime.config.outputDir,
        slug: options.slug,
        title: options.title,
        tags: options.tag ?? [],
        annotate: Boolean(options.annotate),
        thumbnail: Boolean(options.thumbnail),
        dryRun: Boolean(options.dryRun),
        analysisPromptPath: options.analysisPrompt,
        analysisContext: options.analysisContext,
        analysisContextFile: options.analysisContextFile
      });

      logResult(runtime, result);

      if (!result.success) {
        throw new AppError(result.error ?? result.message, 1);
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function logResult(runtime: CliRuntime, result: Awaited<ReturnType<CliRuntime['jobRunner']['generate']>>): void {
  runtime.logger.info(result.message);
  for (const step of result.steps ?? []) {
    runtime.logger.info(`- ${step.status.toUpperCase()} ${step.step}: ${step.message}${step.error ? ` (${step.error})` : ''}`);
  }
}
