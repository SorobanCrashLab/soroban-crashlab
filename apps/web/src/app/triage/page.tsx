'use client';

/**
 * Issue Triage Board page – /triage
 * Implements frontend Issue triage board UI for improved UX.
 *
 * Features: kanban-style columns (Failed / Active / Cancelled),
 * loading/error states, keyboard accessibility, responsive layout.
 */

import { useEffect, useState } from 'react';
import type { FuzzingRun, RunStatus, RunArea, RunSeverity } from '../types';
import {
  TRIAGE_COLUMNS,
  getColumnRuns,
  type TriageColumnDef,
} from './triage-board-utils';

// ---------------------------------------------------------------------------
// Mock data loader (replace with real API call when backend is wired)
// ---------------------------------------------------------------------------
const MOCK_RUNS: FuzzingRun[] = Array.from({ length: 18 }, (_, i) => ({
  id: `run-${1000 + i}`,
  status: (['failed', 'running', 'cancelled', 'completed'] as RunStatus[])[i % 4],
  area: (['auth', 'state', 'budget', 'xdr'] as RunArea[])[i % 4],
  severity: (['low', 'medium', 'high', 'critical'] as RunSeverity[])[i % 4],
  duration: 120_000 + i * 30_000,
  seedCount: 10_000 + i * 1_000,
  cpuInstructions: 400_000 + i * 10_000,
  memoryBytes: 1_500_000 + i * 100_000,
  minResourceFee: 500 + i * 50,
  crashDetail: i % 4 === 0
    ? { failureCategory: 'InvariantViolation', signature: `sig:${1000 + i}`, payload: '{}', replayAction: `cargo run --bin replay-single-seed -- bundle-${i}.json` }
    : null,
}));

async function fetchRuns(): Promise<FuzzingRun[]> {
  await new Promise((r) => setTimeout(r, 700));
  return MOCK_RUNS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type PageDataState = 'loading' | 'success' | 'error';

const SEVERITY_DOT: Record<string, string> = {
  low:      'bg-zinc-400',
  medium:   'bg-amber-400',
  high:     'bg-orange-500',
  critical: 'bg-rose-600',
};

const COLUMN_STYLE: Record<string, { bg: string; border: string; badge: string }> = {
  failed:    { bg: 'bg-rose-50/50 dark:bg-rose-950/10',   border: 'border-rose-100 dark:border-rose-900/30',   badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'   },
  active:    { bg: 'bg-blue-50/50 dark:bg-blue-950/10',   border: 'border-blue-100 dark:border-blue-900/30',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'   },
  cancelled: { bg: 'bg-zinc-50/50 dark:bg-zinc-950/10',   border: 'border-zinc-200 dark:border-zinc-800',      badge: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'      },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading triage board" className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3 min-h-[320px]">
          <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-20 text-center">
      <svg className="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <p className="text-zinc-600 dark:text-zinc-400">Failed to load triage data. Check your connection and try again.</p>
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

function RunCard({ run }: { run: FuzzingRun }) {
  return (
    <article
      className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md focus-within:ring-2 focus-within:ring-indigo-500 transition-all"
      aria-label={`Run ${run.id}, area ${run.area}, severity ${run.severity}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{run.id}</span>
        <span
          className={`h-2 w-2 rounded-full ${SEVERITY_DOT[run.severity] ?? 'bg-zinc-400'}`}
          aria-label={`Severity: ${run.severity}`}
        />
      </div>
      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2 capitalize">{run.area}</div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="uppercase tracking-wide font-semibold">{run.severity}</span>
        <span>{Math.round(run.seedCount / 1000)}k seeds</span>
      </div>
      {run.crashDetail && (
        <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 truncate" title={run.crashDetail.failureCategory}>
          {run.crashDetail.failureCategory}
        </div>
      )}
    </article>
  );
}

function TriageColumn({ col, runs }: { col: TriageColumnDef; runs: FuzzingRun[] }) {
  const style = COLUMN_STYLE[col.id];
  return (
    <section
      aria-labelledby={`col-${col.id}`}
      className={`flex flex-col rounded-2xl border ${style.border} ${style.bg} p-5 min-h-[400px]`}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 id={`col-${col.id}`} className="font-bold text-lg text-zinc-900 dark:text-zinc-50">
          {col.title}
        </h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}>
          {runs.length}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 text-xs font-medium">
            No items
          </div>
        ) : (
          runs.map((run) => <RunCard key={run.id} run={run} />)
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TriageBoardPage() {
  const [dataState, setDataState] = useState<PageDataState>('loading');
  const [runs, setRuns] = useState<FuzzingRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((data) => {
        if (!cancelled) { setRuns(data); setDataState('success'); }
      })
      .catch(() => {
        if (!cancelled) setDataState('error');
      });
    return () => { cancelled = true; };
  }, []);

  const handleRetry = () => {
    setDataState('loading');
    setRuns([]);
    fetchRuns()
      .then((data) => { setRuns(data); setDataState('success'); })
      .catch(() => setDataState('error'));
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Issue Triage Board
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage failures and active campaigns in a kanban-style view.
        </p>
      </div>

      {dataState === 'loading' && <LoadingSkeleton />}
      {dataState === 'error'   && <ErrorState onRetry={handleRetry} />}

      {dataState === 'success' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TRIAGE_COLUMNS.map((col) => (
            <TriageColumn key={col.id} col={col} runs={getColumnRuns(runs, col)} />
          ))}
        </div>
      )}
    </div>
  );
}
