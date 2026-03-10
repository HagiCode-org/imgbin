import { AppError } from '../lib/errors.js';
import type { Command } from 'commander';
import type { CliRuntime } from '../lib/runtime.js';

interface BatchOptions {
  manifest: string;
  output?: string;
  dryRun?: boolean;
}

export function registerBatchCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('batch')
    .description('Run multiple image jobs from a JSON or YAML manifest.')
    .requiredOption('--manifest <path>', 'Path to batch manifest')
    .option('--output <dir>', 'Override output directory for generated jobs')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (options: BatchOptions) => {
      const manifest = await runtime.manifestLoader.load(options.manifest);
      const result = await runtime.jobRunner.batch(manifest.jobs, options.output ?? runtime.config.outputDir, Boolean(options.dryRun));

      runtime.logger.info(`Batch complete: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed.`);
      for (const item of result.results) {
        runtime.logger.info(`- ${item.success ? 'OK' : 'FAIL'} ${item.message}${item.error ? ` (${item.error})` : ''}`);
      }

      if (!result.success) {
        throw new AppError('One or more batch jobs failed.', 1);
      }
    });
}
