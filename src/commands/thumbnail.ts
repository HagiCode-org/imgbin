import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';

interface ThumbnailOptions {
  dryRun?: boolean;
}

export function registerThumbnailCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('thumbnail <assetPath>')
    .description('Generate or refresh a thumbnail for an existing asset.')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (assetPath: string, options: ThumbnailOptions) => {
      const result = await runtime.jobRunner.thumbnail({
        assetPath,
        dryRun: Boolean(options.dryRun)
      });

      if (!result.success) {
        throw new AppError(result.error ?? result.message, 1);
      }

      runtime.logger.info(result.message);
    });
}
