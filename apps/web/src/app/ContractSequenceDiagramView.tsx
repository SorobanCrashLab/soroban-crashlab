'use client';

import React, { useMemo, useState } from 'react';
import {
  filterSequenceSteps,
  type SequenceStep,
  type SequenceStepStatus,
} from './sequence-diagram-utils';

type DataState = 'loading' | 'error' | 'empty' | 'ready';

export interface ContractSequenceDiagramViewProps {
  steps: SequenceStep[];
  runId?: string;
  dataState?: DataState;
  errorMessage?: string;
  onRetry?: () => void;
}

const STATUS_STYLES: Record<SequenceStepStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  error:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
  pending:
    'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
};

export default function ContractSequenceDiagramView({
  steps,
  runId,
  dataState = 'ready',
  errorMessage = 'Failed to load sequence diagram.',
  onRetry,
}: ContractSequenceDiagramViewProps) {
  const [statusFilter, setStatusFilter] = useState<SequenceStepStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterSequenceSteps(steps, { status: statusFilter, query }),
    [steps, statusFilter, query],
  );

  if (dataState === 'loading') {
    return (
      <section
        className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] p-6 animate-pulse"
        aria-label="Loading sequence diagram"
        role="status"
      >
        <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === 'error') {
    return (
      <section className="w-full rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20 p-6 text-center">
        <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-100">Sequence diagram error</h2>
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        )}
      </section>
    );
  }

  if (dataState === 'empty' || steps.length === 0) {
    return (
      <section className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No contract calls</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This run has no recorded contract call sequence yet.
        </p>
      </section>
    );
  }

  return (
    <section
      className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl p-6 shadow-xl"
      aria-label="Contract call sequence diagram"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Call sequence</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Contract invocation order{runId ? ` for ${runId}` : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <label className="sr-only" htmlFor="sequence-query">
            Filter sequence steps
          </label>
          <input
            id="sequence-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter caller, callee, method…"
            className="w-full sm:w-64 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SequenceStepStatus | 'all')}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[var(--bg)] px-3 py-2 text-sm"
            aria-label="Filter by step status"
          >
            <option value="all">All statuses</option>
            <option value="ok">Ok</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">No steps match this filter.</p>
      ) : (
        <ol className="relative space-y-4">
          {filtered.map((step, index) => (
            <li
              key={step.id}
              className="relative flex flex-col sm:flex-row sm:items-stretch gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] p-4"
            >
              <div className="flex sm:flex-col items-center gap-2 sm:w-24 shrink-0">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                  {step.order}
                </span>
                {index < filtered.length - 1 && (
                  <span className="hidden sm:block flex-1 w-0.5 bg-zinc-200 dark:bg-zinc-800 min-h-6" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.caller}</span>
                  <span className="text-zinc-400" aria-hidden="true">
                    →
                  </span>
                  <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-300">{step.callee}</span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">.{step.method}()</span>
                  <span className={`ml-auto text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[step.status]}`}>
                    {step.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{step.durationMs} ms</span>
                  {step.detail && <span>{step.detail}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
