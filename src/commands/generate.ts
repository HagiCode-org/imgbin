import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';

interface GenerateOptions {
  prompt: string;
  output?: string;
  slug?: string;
  title?: string;
  tag?: string[];
  annotate?: boolean;
  thumbnail?: boolean;
  dryRun?: boolean;
}

export function registerGenerateCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('generate')
    .description('Generate a new image asset and metadata.')
    .requiredOption('--prompt <text>', 'Prompt used for image generation')
    .option('--output <dir>', 'Output root directory')
    .option('--slug <slug>', 'Optional asset slug override')
    .option('--title <title>', 'Optional title override')
    .option('--tag <tag>', 'Add a tag to metadata', collect, [])
    .option('--annotate', 'Run AI recognition after generation')
    .option('--thumbnail', 'Create a thumbnail after generation')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (options: GenerateOptions) => {
      const result = await runtime.jobRunner.generate({
        prompt: options.prompt,
        output: options.output ?? runtime.config.outputDir,
        slug: options.slug,
        title: options.title,
        tags: options.tag ?? [],
        annotate: Boolean(options.annotate),
        thumbnail: Boolean(options.thumbnail),
        dryRun: Boolean(options.dryRun)
      });

      if (!result.success) {
        throw new AppError(result.error ?? result.message, 1);
      }

      runtime.logger.info(result.message);
    });
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
