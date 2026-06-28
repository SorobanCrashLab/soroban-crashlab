'use client';

/**
 * Log Viewer page – /logs
 * Issue seed #56: Display structured logs from runs with search.
 *
 * Features: searchable logs, timestamp anchors, loading/error states,
 * keyboard accessibility, responsive layout.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  filterLogEntries,
  type LogEntry,
  type LogLevel,
  type LogLevelFilter,
} from '../log-viewer-utils';
import {
  logEntryAnchorId,
  logEntryAnchorHref,
  type PageDataState,
} from './log-viewer-page-utils';
import { useDebounce } from '../../lib/useDebounce';
import { MOCK_LOG_ENTRIES } from '../../fixtures/logs';
import { useDataTableKeyboardNav } from '../use-data-table-keyboard-nav';

async function fetchLogs(): Promise<LogEntry[]> {
  await new Promise((r) => setTimeout(r, 800));
  return MOCK_LOG_ENTRIES;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LEVEL_OPTIONS: { value: LogLevelFilter; label: string }[] = [
  { value: 'all',   label: 'All'   },
  { value: 'info',  label: 'Info'  },
  { value: 'warn',  label: 'Warn'  },
  { value: 'error', label: 'Error' },
  { value: 'debug', label: 'Debug' },
];

const LEVEL_BADGE: Record<LogLevel, string> = {
  info:  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  warn:  'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  error: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  debug: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 23) + 'Z';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading logs" className="space-y-2 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-8 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-meta">Failed to load logs. Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-primary text-xs sm:text-sm"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-center py-16 text-meta">
      No log entries match the current filters.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LogViewerPage() {
  const [dataState, setDataState] = useState<PageDataState>('loading');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [fetchAttempt, setFetchAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchLogs()
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setDataState('success');
        }
      })
      .catch(() => {
        if (!cancelled) setDataState('error');
      });
    return () => { cancelled = true; };
  }, [fetchAttempt]);

  const handleRetry = () => {
    setDataState('loading');
    setFetchAttempt((n) => n + 1);
  };

  const visible = useMemo(
    () =>
      filterLogEntries(entries, { level: levelFilter, query: debouncedSearchQuery }).sort(
        (a, b) => a.timestamp - b.timestamp,
      ),
    [entries, levelFilter, debouncedSearchQuery],
  );

  const { getRowProps } = useDataTableKeyboardNav({
    rowCount: visible.length,
    onActivate: (index) => {
      const entry = visible[index];
      if (!entry) {
        return;
      }
      const row = document.getElementById(logEntryAnchorId(entry));
      row?.scrollIntoView({ block: 'nearest' });
      row?.querySelector<HTMLElement>('a')?.focus();
    },
  });

  return (
    <div className="container-full page-padding fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Log Viewer</h1>
          <p className="text-meta mt-0.5 sm:mt-1">Structured run logs with search and timestamp anchors</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-6">
        {/* Level filter */}
        <div role="group" aria-label="Filter by log level" className="flex flex-wrap gap-2">
          {LEVEL_OPTIONS.map((opt) => {
            const active = levelFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setLevelFilter(opt.value)}
                className={
                  active
                    ? 'chip chip-active text-xs'
                    : 'chip text-xs'
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <label className="flex-1 min-w-[14rem]">
          <span className="sr-only">Search logs</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search message or source…"
            className="input-field"
          />
        </label>
      </div>

      {/* Content area */}
      <section
        aria-labelledby="log-table-heading"
        className="card overflow-hidden"
      >
        <h2 id="log-table-heading" className="sr-only">Log entries</h2>

        {dataState === 'loading' && (
          <div className="card-padding">
            <LoadingSkeleton />
          </div>
        )}

        {dataState === 'error' && (
          <ErrorState onRetry={handleRetry} />
        )}

        {dataState === 'success' && visible.length === 0 && <EmptyState />}

        {dataState === 'success' && visible.length > 0 && (
          <>
            {/* Status bar */}
            <div className="px-4 py-2" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border-color)' }}>
              <span className="text-meta">Showing {visible.length} of {entries.length} entries</span>
            </div>

            {/* Log table */}
            <div className="table-responsive">
              <table
                className="data-table w-full text-xs sm:text-sm font-mono"
                aria-label="Log entries"
              >
                <thead>
                  <tr>
                    <th scope="col" className="w-24 sm:w-52">Timestamp</th>
                    <th scope="col" className="w-14 sm:w-20">Level</th>
                    <th scope="col" className="hidden sm:table-cell w-32">Source</th>
                    <th scope="col">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry, index) => (
                    <tr
                      key={entry.id}
                      id={logEntryAnchorId(entry)}
                      {...getRowProps(index)}
                      aria-label={`Log entry ${entry.level} from ${entry.source}`}
                    >
                      <td className="text-meta whitespace-nowrap text-[10px] sm:text-xs">
                        <a
                          href={logEntryAnchorHref(entry)}
                          className="link text-[10px] sm:text-xs"
                          aria-label={`Anchor for log entry at ${formatTimestamp(entry.timestamp)}`}
                        >
                          {formatTimestamp(entry.timestamp)}
                        </a>
                      </td>
                      <td>
                        <span className={`text-[9px] sm:text-[10px] uppercase font-bold px-1 sm:px-1.5 py-0.5 rounded border ${LEVEL_BADGE[entry.level]}`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell" style={{ color: '#0A66C2' }}>
                        {entry.source}
                      </td>
                      <td className="break-all text-[11px] sm:text-sm">
                        {entry.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
