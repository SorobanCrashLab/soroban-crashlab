'use client';

import { useEffect, useState } from 'react';
import type { FuzzingRun } from '../../types';
import dynamic from 'next/dynamic';
import { fetchRuns as fetchRunsFromApi } from '../../../lib/api-client';

const AddAFuzzyQueryBuilderPage51 = dynamic(
  () => import('../../add-a-fuzzy-query-builder-page-51'),
  { ssr: false }
);

async function fetchRuns(): Promise<FuzzingRun[]> {
  const data = await fetchRunsFromApi();
  return data.runs ?? [];
}

type PageDataState = 'loading' | 'success' | 'error';

function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading query builder"
      className="space-y-4 animate-pulse"
    >
      <div className="h-8 w-72 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-40 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950" />
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
        Failed to load runs for the query builder. Check your connection and
        try again.
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

export default function RunsQueryPage() {
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
          Fuzzy Query Builder
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Build saved filters to search and analyze fuzzing runs.
        </p>
      </div>

      {dataState === 'loading' && <LoadingSkeleton />}
      {dataState === 'error' && <ErrorState onRetry={handleRetry} />}
      {dataState === 'success' && <AddAFuzzyQueryBuilderPage51 runs={runs} />}
    </div>
  );
}
