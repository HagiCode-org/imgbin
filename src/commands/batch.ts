import { AppError } from '../lib/errors.js';
import type { Command } from 'commander';
import type { CliRuntime } from '../lib/runtime.js';

interface BatchOptions {
  manifest?: string;
  pendingLibrary?: string;
  output?: string;
  dryRun?: boolean;
}

export function registerBatchCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('batch')
    .description('Run multiple image jobs from a manifest or batch-process pending assets in a library.')
    .option('--manifest <path>', 'Path to batch manifest')
    .option('--pending-library <dir>', 'Scan a managed library for assets with pending or failed analysis')
    .option('--output <dir>', 'Override output directory for generated jobs')
    .option('--dry-run', 'Preview work without writing files')
    .action(async (options: BatchOptions) => {
      if (!options.manifest && !options.pendingLibrary) {
        throw new AppError('Provide either --manifest or --pending-library.', 1);
      }
      if (options.manifest && options.pendingLibrary) {
        throw new AppError('Provide either --manifest or --pending-library, not both.', 1);
      }

      const manifest = options.manifest
        ? await runtime.manifestLoader.load(options.manifest)
        : { jobs: [{ pendingLibrary: options.pendingLibrary! }] };
      const result = await runtime.jobRunner.batch(manifest.jobs, options.output ?? runtime.config.outputDir, Boolean(options.dryRun));

      runtime.logger.info(`Batch complete: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed.`);
      for (const item of result.results) {
        runtime.logger.info(`- ${item.success ? 'OK' : 'FAIL'} ${item.message}${item.error ? ` (${item.error})` : ''}`);
        for (const step of item.steps ?? []) {
          runtime.logger.info(`  * ${step.status.toUpperCase()} ${step.step}: ${step.message}${step.error ? ` (${step.error})` : ''}`);
        }
      }

      if (!result.success) {
        throw new AppError('One or more batch jobs failed.', 1);
      }
    });
}
