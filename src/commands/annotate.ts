import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';

interface AnnotateOptions {
  overwrite?: boolean;
  dryRun?: boolean;
}

export function registerAnnotateCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('annotate <assetPath>')
    .description('Annotate an existing image asset with vision suggestions.')
    .option('--overwrite', 'Overwrite previously recognized fields')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (assetPath: string, options: AnnotateOptions) => {
      const result = await runtime.jobRunner.annotate({
        assetPath,
        overwrite: Boolean(options.overwrite),
        dryRun: Boolean(options.dryRun)
      });

      if (!result.success) {
        throw new AppError(result.error ?? result.message, 1);
      }

      runtime.logger.info(result.message);
    });
}
