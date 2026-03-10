import type { Command } from 'commander';
import { AppError } from '../lib/errors.js';
import type { CliRuntime } from '../lib/runtime.js';
import type { SearchCommandResult } from '../types.js';

interface SearchOptions {
  library?: string;
  query?: string;
  exact?: boolean;
  fuzzy?: boolean;
  limit?: string;
  json?: boolean;
  reindex?: boolean;
}

export function registerSearchCommand(program: Command, runtime: CliRuntime): void {
  program
    .command('search')
    .description('Search a managed ImgBin library by metadata and prompt fields.')
    .requiredOption('--library <dir>', 'Managed library root directory')
    .requiredOption('--query <text>', 'Search query text')
    .option('--exact', 'Use exact matching mode')
    .option('--fuzzy', 'Use fuzzy matching mode')
    .option('--limit <n>', 'Maximum results to return', '10')
    .option('--json', 'Emit machine-readable JSON output')
    .option('--reindex', 'Rebuild the library index before searching')
    .action(async (options: SearchOptions) => {
      if (options.exact && options.fuzzy) {
        throw new AppError('Choose either --exact or --fuzzy, not both.', 1);
      }

      const limit = Number.parseInt(options.limit ?? '10', 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new AppError('--limit must be a positive integer.', 1);
      }

      const result = await runtime.searchService.search({
        library: options.library!,
        query: options.query!,
        mode: options.fuzzy ? 'fuzzy' : 'exact',
        limit,
        output: options.json ? 'json' : 'text',
        reindex: Boolean(options.reindex)
      });

      logResult(runtime, result, Boolean(options.json));
    });
}

function logResult(runtime: CliRuntime, result: SearchCommandResult, jsonOutput: boolean): void {
  if (jsonOutput) {
    runtime.logger.info(JSON.stringify(result, null, 2));
    return;
  }

  if (result.rebuilt) {
    runtime.logger.info(
      `Rebuilt search index at ${result.indexPath} (${result.indexedCount} indexed, ${result.skippedCount} skipped).`
    );
  } else {
    runtime.logger.info(`Using search index at ${result.indexPath}.`);
  }

  runtime.logger.info(
    `Query "${result.query}" (${result.mode}) returned ${result.totalMatches} result${result.totalMatches === 1 ? '' : 's'}.`
  );

  if (result.totalMatches === 0) {
    runtime.logger.info('No assets matched. Try refining the query or re-run with --reindex.');
    return;
  }

  result.results.forEach((item, index) => {
    runtime.logger.info(`${index + 1}. ${item.slug} | score=${item.score.toFixed(2)}`);
    runtime.logger.info(`   title: ${item.title}`);
    runtime.logger.info(`   tags: ${item.tags.join(', ') || '(none)'}`);
    runtime.logger.info(`   matched: ${item.matchedFields.join(', ')}`);
    runtime.logger.info(`   path: ${item.assetDir}`);
  });
}
