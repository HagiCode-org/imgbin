export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface LoggerOptions {
  quiet?: boolean;
  verbose?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return {
    info(message: string) {
      if (!options.quiet) {
        console.log(message);
      }
    },
    warn(message: string) {
      if (!options.quiet) {
        console.warn(message);
      }
    },
    error(message: string) {
      console.error(message);
    },
    debug(message: string) {
      if (options.verbose) {
        console.debug(message);
      }
    }
  };
}
