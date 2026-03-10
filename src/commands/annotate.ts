import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';

interface AnnotateOptions {
  overwrite?: boolean;
  dryRun?: boolean;
  importTo?: string;
  analysisPrompt?: string;
  slug?: string;
  title?: string;
  tag?: string[];
  thumbnail?: boolean;
}

export function registerAnnotateCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('annotate <assetPath>')
    .description('Annotate a managed asset, or import a standalone image into the library before analysis.')
    .option('--overwrite', 'Overwrite previously recognized fields')
    .option('--import-to <dir>', 'Import a standalone image into this library directory before analysis')
    .option('--analysis-prompt <path>', 'Override the default local analysis prompt file')
    .option('--slug <slug>', 'Optional slug override when importing a standalone image')
    .option('--title <title>', 'Optional title to seed metadata when importing')
    .option('--tag <tag>', 'Add a tag to metadata when importing', collect, [])
    .option('--thumbnail', 'Create a thumbnail after analysis')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (assetPath: string, options: AnnotateOptions) => {
      const result = await runtime.jobRunner.annotate({
        assetPath,
        overwrite: Boolean(options.overwrite),
        dryRun: Boolean(options.dryRun),
        importTo: options.importTo,
        analysisPromptPath: options.analysisPrompt,
        slug: options.slug,
        title: options.title,
        tags: options.tag ?? [],
        thumbnail: Boolean(options.thumbnail)
      });

      runtime.logger.info(result.message);
      for (const step of result.steps ?? []) {
        runtime.logger.info(`- ${step.status.toUpperCase()} ${step.step}: ${step.message}${step.error ? ` (${step.error})` : ''}`);
      }

      if (!result.success) {
        throw new AppError(result.error ?? result.message, 1);
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
