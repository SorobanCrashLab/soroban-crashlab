'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import FailureClusterView from '../../FailureClusterView';
import RunClusterVisualization from '../../add-run-cluster-visualization';
import type { FuzzingRun } from '../../types';

function ClustersContent() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<'loading' | 'error' | 'success'>('loading');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDataState('loading');
      try {
        const res = await fetch('/api/runs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setRuns(data.runs ?? []);
          setDataState('success');
        }
      } catch {
        if (!cancelled) setDataState('error');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-4 transition"
          >
            Back to Analytics
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Failure Signature Clustering
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl">
            Group repeated crashes by stable failure signatures and contract call context.
            Each cluster links to a representative run so triage can start from one sample.
          </p>
        </div>

        {dataState === 'loading' && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
            Loading failure clusters...
          </div>
        )}

        {dataState === 'error' && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
            Failed to load runs for clustering.
          </div>
        )}

        {dataState === 'success' && (
          <div className="space-y-8">
            <FailureClusterView runs={runs} pathname={pathname} queryString={queryString} />
            <RunClusterVisualization
              runs={runs}
              dataState="success"
              showTimeline={true}
              showMetrics={true}
              initialClusterMode="failure"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClustersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading clusters...</div>}>
      <ClustersContent />
    </Suspense>
  );
}
