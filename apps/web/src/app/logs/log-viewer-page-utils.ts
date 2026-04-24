/**
 * Pure helpers for the log viewer page (SorobanCrashLab/soroban-crashlab#56).
 */

import { filterLogEntries, type LogEntry, type LogLevelFilter } from '../log-viewer-utils';

/** Stable anchor id for a log entry (used for timestamp deep-links). */
export function logEntryAnchorId(entry: LogEntry): string {
  return `log-${entry.id}`;
}

/** Returns the URL hash fragment to deep-link to a specific log entry. */
export function logEntryAnchorHref(entry: LogEntry): string {
  return `#${logEntryAnchorId(entry)}`;
}

export type PageDataState = 'loading' | 'success' | 'error';

export interface LogPageState {
  dataState: PageDataState;
  entries: LogEntry[];
  levelFilter: LogLevelFilter;
  searchQuery: string;
}

/** Returns filtered + sorted entries for the current page state. */
export function getVisibleEntries(state: LogPageState): LogEntry[] {
  if (state.dataState !== 'success') return [];
  return filterLogEntries(state.entries, {
    level: state.levelFilter,
    query: state.searchQuery,
  }).sort((a, b) => a.timestamp - b.timestamp);
}
