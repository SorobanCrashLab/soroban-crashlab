export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
}

export type LogLevelFilter = 'all' | LogLevel;

export interface FilterLogEntriesOptions {
  level: LogLevelFilter;
  query: string;
}

export function compareLogEntriesByTime(a: LogEntry, b: LogEntry): number {
  return a.timestamp - b.timestamp;
}

/**
 * Returns entries matching level (or all levels) and case-insensitive substring on message or source.
 */
export function filterLogEntries(
  entries: LogEntry[],
  options: FilterLogEntriesOptions,
): LogEntry[] {
  const q = options.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (options.level !== 'all' && e.level !== options.level) {
      return false;
    }
    if (q.length === 0) return true;
    return (
      e.message.toLowerCase().includes(q) || e.source.toLowerCase().includes(q)
    );
  });
}
