'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FuzzingRun } from '../types';
import { fetchRuns } from '../../lib/api-client';
import VirtualizedRunTable from '../implement-virtualized-run-table-component';

const RUN_TABLE_COLUMNS = ['id', 'status', 'area', 'severity', 'duration', 'seedCount'];

export default function RunsPage() {
  const router = useRouter();
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>('loading');
  const [runs, setRuns] = useState<FuzzingRun[]>([]);

  const goToRun = useCallback((runId: string) => {
    router.push(`/runs/${runId}`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDataState('loading');
      try {
        const data = await fetchRuns();
        if (!cancelled) {
          const sorted = (data.runs ?? []).slice().sort((a: FuzzingRun, b: FuzzingRun) => {
            const ta = a.queuedAt ?? a.startedAt ?? '';
            const tb = b.queuedAt ?? b.startedAt ?? '';
            return tb.localeCompare(ta);
          });
          setRuns(sorted);
          setDataState('success');
        }
      } catch {
        if (!cancelled) setDataState('error');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="container-full page-padding fade-in">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Fuzzing Runs</h1>
          <p className="text-meta mt-0.5 sm:mt-1">All fuzzing campaigns and their execution results</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {dataState === 'success' && (
            <span className="chip text-xs sm:text-sm">{runs.length} Total Runs</span>
          )}
          <Link href="/" className="btn-outline text-xs sm:text-sm px-3 sm:px-6 h-8 sm:h-10">Dashboard</Link>
        </div>
      </div>

      {dataState === 'loading' && (
        <div role="status" aria-live="polite" className="card card-padding">
          <div className="space-y-3 sm:space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-2 sm:gap-4">
                <div className="skeleton h-4 w-16 sm:w-20" />
                <div className="skeleton h-4 w-12 sm:w-16" />
                <div className="skeleton h-4 w-10 sm:w-12" />
                <div className="skeleton h-4 w-12 sm:w-16" />
                <div className="skeleton h-4 w-16 sm:w-24" />
              </div>
            ))}
          </div>
        </div>
      )}

      {dataState === 'error' && (
        <div role="alert" className="card card-padding text-center py-8 sm:py-12" style={{ borderLeft: '4px solid #CC1016' }}>
          <span className="text-2xl sm:text-3xl mb-2 sm:mb-3 block">⚠</span>
          <p className="font-semibold" style={{ color: '#CC1016' }}>Failed to load fuzzing runs</p>
          <p className="text-meta mt-1 mb-3 sm:mb-4">Check your connection and try again.</p>
          <button onClick={() => window.location.reload()} className="btn-primary text-xs sm:text-sm">
            Retry
          </button>
        </div>
      )}

      {dataState === 'success' && (
        <VirtualizedRunTable
          runs={runs}
          viewportHeight={600}
          visibleColumns={RUN_TABLE_COLUMNS}
          onSelectRun={goToRun}
          onViewReport={(run) => goToRun(run.id)}
        />
      )}
    </div>
  );
}
