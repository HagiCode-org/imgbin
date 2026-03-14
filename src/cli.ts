#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { Command, CommanderError } from 'commander';
import { registerAnnotateCommand } from './commands/annotate.js';
import { registerBatchCommand } from './commands/batch.js';
import { registerGenerateCommand } from './commands/generate.js';
import { registerSearchCommand } from './commands/search.js';
import { registerThumbnailCommand } from './commands/thumbnail.js';
import { AppError } from './lib/errors.js';
import { createRuntime, type CliRuntime, type RuntimeOptions } from './lib/runtime.js';

export function buildCli(runtime: CliRuntime): Command {
  const program = new Command();

  program
    .name('imgbin')
    .description('Generate, annotate, and index image assets.')
    .showHelpAfterError()
    .exitOverride()
    .option('--quiet', 'Reduce output noise')
    .option('--verbose', 'Enable debug logging');

  registerGenerateCommand(program, runtime);
  registerAnnotateCommand(program, runtime);
  registerThumbnailCommand(program, runtime);
  registerBatchCommand(program, runtime);
  registerSearchCommand(program, runtime);

  return program;
}

export async function runCli(argv = process.argv, options: RuntimeOptions = {}): Promise<number> {
  try {
    const runtime = createRuntime(options);
    const cli = buildCli(runtime);
    await cli.parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code !== 'commander.helpDisplayed') {
        console.error(error.message);
      }
      return error.exitCode || 1;
    }

    if (error instanceof AppError) {
      console.error(error.message);
      return error.exitCode;
    }

    console.error(error instanceof Error ? error.message : 'Unknown error');
    return 1;
  }
}

export async function isExecutedAsScript(importMetaUrl: string, argv1 = process.argv[1]): Promise<boolean> {
  if (!argv1) {
    return false;
  }

  const [scriptPath, invokedPath] = await Promise.all([
    resolveExecutionPath(fileURLToPath(importMetaUrl)),
    resolveExecutionPath(argv1)
  ]);

  return scriptPath === invokedPath;
}

async function resolveExecutionPath(targetPath: string): Promise<string> {
  const resolvedPath = path.resolve(targetPath);

  try {
    return await realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

if (await isExecutedAsScript(import.meta.url)) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
