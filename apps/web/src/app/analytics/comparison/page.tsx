'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AddRunComparisonSideBySideView from '../../add-run-comparison-side-by-side-view';
import type { FuzzingRun } from '../../types';

export default function ComparisonPage() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<'loading' | 'error' | 'success'>('loading');
  const [fetchAttempt, setFetchAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const load = async () => {
      setDataState('loading');
      try {
        const res = await fetch('/api/runs', { signal: ctrl.signal });
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
      ctrl.abort();
    };
  }, [fetchAttempt]);

  const handleRetry = useCallback(() => {
    setFetchAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <Link href="/analytics" className="link text-xs sm:text-sm">
          ← Back to Analytics
        </Link>
        <h1 className="heading-page mt-2">Run Comparison</h1>
        <p className="text-meta mt-0.5 sm:mt-1">
          Compare two fuzzing runs side by side to spot metric drift and metadata differences
        </p>
      </div>

      <AddRunComparisonSideBySideView runs={runs} dataState={dataState} onRetry={handleRetry} />
    </div>
  );
}
