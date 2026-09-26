import { structuredLogger } from './structured-logger';

type LogLevel = 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

type Writer = (line: string) => void;

function defaultWriter(line: string): void {
  process.stdout.write(line + '\n');
}

/**
 * @deprecated Use structuredLogger from './structured-logger' instead.
 * This is a shim to maintain backwards compatibility during migration.
 */
export function createLogger(_writer: Writer = defaultWriter) {
  return {
    info(msg: string, fields?: LogFields): void { void structuredLogger.info(msg, fields); },
    warn(msg: string, fields?: LogFields): void { void structuredLogger.warn(msg, fields); },
    error(msg: string, fields?: LogFields): void { void structuredLogger.error(msg, fields); },
  };
}

/**
 * @deprecated Use structuredLogger from './structured-logger' instead.
 */
export const logger = createLogger();
