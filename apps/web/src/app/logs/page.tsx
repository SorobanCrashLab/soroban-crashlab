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

// ---------------------------------------------------------------------------
// Mock data loader (replace with real API call when backend is wired)
// ---------------------------------------------------------------------------
const MOCK_ENTRIES: LogEntry[] = [
  { id: '1', timestamp: Date.now() - 300_000, level: 'info',  source: 'fuzz-worker', message: 'Campaign drive_run started (partition 0/4)' },
  { id: '2', timestamp: Date.now() - 270_000, level: 'debug', source: 'fuzz-worker', message: 'Mutation stream seeded from case id 0x7a3f' },
  { id: '3', timestamp: Date.now() - 240_000, level: 'warn',  source: 'rpc',         message: 'RPC latency p95 820ms (threshold 750ms)' },
  { id: '4', timestamp: Date.now() - 210_000, level: 'info',  source: 'scheduler',   message: 'Checkpoint advanced: next_seed_index=18432' },
  { id: '5', timestamp: Date.now() - 180_000, level: 'error', source: 'fuzz-worker', message: 'InvariantViolation: balance_nonnegative (signature recorded)' },
  { id: '6', timestamp: Date.now() - 150_000, level: 'info',  source: 'rpc',         message: 'Replay envelope submitted for run-1012' },
  { id: '7', timestamp: Date.now() - 120_000, level: 'debug', source: 'scheduler',   message: 'PRNG state commit checkpoint=73728' },
  { id: '8', timestamp: Date.now() -  90_000, level: 'warn',  source: 'fuzz-worker', message: 'Soft budget warning on contract token (91% instr)' },
  { id: '9', timestamp: Date.now() -  60_000, level: 'error', source: 'rpc',         message: 'Transient RPC timeout (attempt 2/3)' },
  { id: '10', timestamp: Date.now() - 30_000, level: 'info',  source: 'scheduler',   message: 'Partition 0/4 complete – 18432 seeds processed' },
];

async function fetchLogs(): Promise<LogEntry[]> {
  // Simulate network latency; swap for real fetch() when API is available.
  await new Promise((r) => setTimeout(r, 800));
  return MOCK_ENTRIES;
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
        <div key={i} className="h-8 rounded bg-zinc-200 dark:bg-zinc-800" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <svg className="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <p className="text-zinc-600 dark:text-zinc-400">Failed to load logs. Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-center py-16 text-zinc-500 dark:text-zinc-400">
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
      filterLogEntries(entries, { level: levelFilter, query: searchQuery }).sort(
        (a, b) => a.timestamp - b.timestamp,
      ),
    [entries, levelFilter, searchQuery],
  );

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Log Viewer
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Structured run logs with search and timestamp anchors. Issue seed #56.
        </p>
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
                    ? 'px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'px-3 py-1 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
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
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {/* Content area */}
      <section
        aria-labelledby="log-table-heading"
        className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
      >
        <h2 id="log-table-heading" className="sr-only">Log entries</h2>

        {dataState === 'loading' && (
          <div className="p-6">
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
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {visible.length} of {entries.length} entries
            </div>

            {/* Log table */}
            <div
              role="log"
              aria-label="Run log entries"
              aria-live="polite"
              className="overflow-x-auto"
            >
              <table className="w-full text-sm font-mono">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-semibold w-52">Timestamp</th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold w-20">Level</th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold w-32">Source</th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                  {visible.map((entry) => (
                    <tr
                      key={entry.id}
                      id={logEntryAnchorId(entry)}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        <a
                          href={logEntryAnchorHref(entry)}
                          className="hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                          aria-label={`Anchor for log entry at ${formatTimestamp(entry.timestamp)}`}
                        >
                          {formatTimestamp(entry.timestamp)}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${LEVEL_BADGE[entry.level]}`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-cyan-700 dark:text-cyan-400 whitespace-nowrap">
                        {entry.source}
                      </td>
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200 break-all">
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
