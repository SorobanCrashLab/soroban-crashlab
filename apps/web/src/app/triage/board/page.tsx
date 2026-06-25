'use client';

import { useEffect, useState } from 'react';
import type { FuzzingRun } from '../../types';
import ImplementRunWorkflowBoardPage58 from '../../implement-run-workflow-board-page-58';
import { dedupedFetchJson } from '../../../lib/request-dedup';

async function fetchRuns(): Promise<FuzzingRun[]> {
  const data = await dedupedFetchJson<{ runs?: FuzzingRun[] }>('/api/runs');
  return data.runs ?? [];
}

type PageDataState = 'loading' | 'success' | 'error';

function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading workflow board"
      className="space-y-4 animate-pulse"
    >
      <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 min-h-[320px] space-y-3"
          >
            <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-900"
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-20 text-center"
    >
      <svg
        className="w-10 h-10 text-rose-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p className="text-zinc-600 dark:text-zinc-400">
        Failed to load workflow board data. Check your connection and try again.
      </p>
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

export default function WorkflowBoardPage() {
  const [dataState, setDataState] = useState<PageDataState>('loading');
  const [runs, setRuns] = useState<FuzzingRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((data) => {
        if (!cancelled) {
          setRuns(data);
          setDataState('success');
        }
      })
      .catch(() => {
        if (!cancelled) setDataState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = () => {
    setDataState('loading');
    setRuns([]);
    fetchRuns()
      .then((data) => {
        setRuns(data);
        setDataState('success');
      })
      .catch(() => setDataState('error'));
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Run Workflow Board
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Drag runs between Open, In Review, and Closed columns to track triage
          progress.
        </p>
      </div>

      {dataState === 'loading' && <LoadingSkeleton />}
      {dataState === 'error' && <ErrorState onRetry={handleRetry} />}
      {dataState === 'success' && (
        <ImplementRunWorkflowBoardPage58 runs={runs} />
      )}
    </div>
  );
}
