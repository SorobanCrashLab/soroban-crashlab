'use client';

/**
 * Issue #267 – Implement Log viewer component
 *
 * Dashboard panel for tailing simulated fuzzer / RPC / scheduler logs with
 * level filters, search, pause, clear, auto-scroll, and copy.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  compareLogEntriesByTime,
  filterLogEntries,
  type LogEntry,
  type LogLevel,
  type LogLevelFilter,
} from './log-viewer-utils';

const SEED_ENTRIES: LogEntry[] = [
  {
    id: 'seed-1',
    timestamp: Date.now() - 120_000,
    level: 'info',
    source: 'fuzz-worker',
    message: 'Campaign drive_run started (partition 0/4)',
  },
  {
    id: 'seed-2',
    timestamp: Date.now() - 90_000,
    level: 'debug',
    source: 'fuzz-worker',
    message: 'Mutation stream seeded from case id 0x7a3f',
  },
  {
    id: 'seed-3',
    timestamp: Date.now() - 60_000,
    level: 'warn',
    source: 'rpc',
    message: 'RPC latency p95 820ms (threshold 750ms)',
  },
  {
    id: 'seed-4',
    timestamp: Date.now() - 45_000,
    level: 'info',
    source: 'scheduler',
    message: 'Checkpoint advanced: next_seed_index=18432',
  },
  {
    id: 'seed-5',
    timestamp: Date.now() - 30_000,
    level: 'error',
    source: 'fuzz-worker',
    message: 'InvariantViolation: balance_nonnegative (signature recorded)',
  },
  {
    id: 'seed-6',
    timestamp: Date.now() - 10_000,
    level: 'info',
    source: 'rpc',
    message: 'Replay envelope submitted for run-1012',
  },
];

const LEVEL_OPTIONS: { value: LogLevelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'debug', label: 'Debug' },
];

const LEVEL_BADGE_CLASS: Record<LogLevel, string> = {
  info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  warn: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  error: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  debug: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

let streamSeq = 0;

function nextSimulatedEntry(): LogEntry {
  streamSeq += 1;
  const roll = streamSeq % 5;
  const levels: LogLevel[] = ['info', 'debug', 'info', 'warn', 'error'];
  const sources = ['fuzz-worker', 'rpc', 'scheduler'];
  const level = levels[roll];
  const source = sources[streamSeq % sources.length];
  const messages: Record<LogLevel, string> = {
    info: `Heartbeat tick ${streamSeq} — workers healthy`,
    warn: `Soft budget warning on contract token (${streamSeq % 97}% instr)`,
    error: `Transient RPC timeout (attempt ${(streamSeq % 3) + 1}/3)`,
    debug: `PRNG state commit checkpoint=${streamSeq * 4096}`,
  };
  return {
    id: `live-${Date.now()}-${streamSeq}`,
    timestamp: Date.now(),
    level,
    source,
    message: messages[level],
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export default function LogViewer() {
  const [entries, setEntries] = useState<LogEntry[]>(() => [...SEED_ENTRIES]);
  const [paused, setPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      [...filterLogEntries(entries, { level: levelFilter, query: searchQuery })].sort(
        compareLogEntriesByTime,
      ),
    [entries, levelFilter, searchQuery],
  );

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setEntries((prev) => [...prev, nextSimulatedEntry()]);
    }, 2000);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, autoScroll, paused]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const t = window.setTimeout(() => setCopyState('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [copyState]);

  const handleClear = useCallback(() => {
    streamSeq = 0;
    setEntries([...SEED_ENTRIES]);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = filtered
      .map(
        (e) =>
          `${formatTime(e.timestamp)}\t${e.level.toUpperCase()}\t${e.source}\t${e.message}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    }
  }, [filtered]);

  return (
    <section
      className="w-full border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-zinc-950"
      aria-labelledby="log-viewer-heading"
    >
      <header className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-600 dark:bg-slate-500 flex items-center justify-center text-white shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
            </div>
            <div>
              <h2
                id="log-viewer-heading"
                className="text-xl font-bold text-zinc-900 dark:text-zinc-50"
              >
                Log viewer
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Simulated tail of fuzz-worker, RPC, and scheduler output. Pause, filter, search, and copy.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                paused
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
              }`}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Clear
            </button>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Auto-scroll
            </label>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Copy filtered
            </button>
            {copyState === 'ok' && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Copied</span>
            )}
            {copyState === 'err' && (
              <span className="text-xs text-rose-600 dark:text-rose-400">Copy failed</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Log level filter">
            {LEVEL_OPTIONS.map((opt) => {
              const active = levelFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
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
          <label className="flex-1 min-w-[12rem]">
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
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-label="Fuzzer and RPC log output"
        aria-live={paused ? 'off' : 'polite'}
        className="h-72 overflow-y-auto px-4 py-3 font-mono text-sm bg-zinc-950 text-zinc-100 dark:bg-black"
      >
        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-center py-8">No lines match the current filters.</p>
        ) : (
          <ul className="space-y-1 list-none m-0 p-0">
            {filtered.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-zinc-800/80 pb-1 last:border-0">
                <span className="text-zinc-500 shrink-0 tabular-nums">{formatTime(e.timestamp)}</span>
                <span
                  className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${LEVEL_BADGE_CLASS[e.level]}`}
                >
                  {e.level}
                </span>
                <span className="text-cyan-400/90 shrink-0">[{e.source}]</span>
                <span className="text-zinc-200 break-all">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap justify-between gap-2">
        <span>
          Showing {filtered.length} of {entries.length} lines
          {paused ? ' (stream paused)' : ''}
        </span>
        <span>Simulated stream for dashboard demo</span>
      </footer>
    </section>
  );
}
