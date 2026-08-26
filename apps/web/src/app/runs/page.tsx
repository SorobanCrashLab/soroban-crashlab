'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { captureRunListContext } from './swipe/run-list-context';
import type { BulkAction } from '../add-bulk-actions-for-runs';
import {
  applyBulkActionToRuns,
  getSelectedRuns,
  shouldClearSelectionAfterAction,
  toggleAllRunSelection,
  toggleRunSelection,
} from '../runs-bulk-actions-utils';
import { FuzzingRun } from '../types';
import { recordAuditEvent } from '../../lib/audit/audit-sink';
import SavedViewsMenu from '../saved-views/SavedViewsMenu';
import {
  createDefaultViewState,
  decodeViewState,
  encodeViewState,
  type ViewState,
} from '../saved-views/view-state';
import { applyRunFilters } from '../run-filter-utils';
import type { RunArea, RunSeverity, RunStatus } from '../types';
import { fetchRuns } from '../../lib/api-client';
import { LoadingSpinner } from '../../components/LoadingSkeleton';
import { ListState } from '../../components/ListState';

const BulkActionsForRuns = dynamic(() => import('../add-bulk-actions-for-runs'), {
  loading: () => <LoadingSpinner />,
});
const VirtualizedRunTable = dynamic(
  () => import('../implement-virtualized-run-table-component'),
  { loading: () => <LoadingSpinner /> },
);

const RUN_TABLE_COLUMNS = ['id', 'status', 'area', 'severity', 'duration', 'seedCount'];

export default function RunsPage() {
  const router = useRouter();
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>('loading');
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [fetchAttempt, setFetchAttempt] = useState(0);
  // Starts at the default so server and client first paint agree; the URL is
  // read after mount, when `window.location` exists.
  const [viewState, setViewState] = useState<ViewState>(createDefaultViewState);

  useEffect(() => {
    queueMicrotask(() => setViewState(decodeViewState(window.location.search)));
  }, []);

  const applyView = useCallback((next: ViewState) => {
    setViewState(next);
    window.history.replaceState(null, '', `${window.location.pathname}?${encodeViewState(next)}`);
  }, []);

  const goToRun = useCallback((runId: string) => {
    captureRunListContext(
      visibleRuns.map((r) => r.id),
      {
        status: viewState.filters.status as string[],
        area: viewState.filters.area as string[],
        severity: viewState.filters.severity as string[],
        searchTerm: viewState.search,
      },
      viewState.sort,
    );
    router.push(`/runs/${runId}`);
  }, [router, visibleRuns, viewState]);

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

    const handleVisibility = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    return () => { cancelled = true; };
  }, [fetchAttempt]);

  const visibleRuns = useMemo(() => {
    const filtered = applyRunFilters(runs, {
      status: viewState.filters.status as RunStatus[],
      area: viewState.filters.area as RunArea[],
      severity: viewState.filters.severity as RunSeverity[],
      searchTerm: viewState.search,
      hasCrash: viewState.filters.hasCrash,
    });

    const direction = viewState.sort.direction === 'asc' ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const left = String(a[viewState.sort.key as keyof FuzzingRun] ?? '');
      const right = String(b[viewState.sort.key as keyof FuzzingRun] ?? '');
      return left.localeCompare(right) * direction;
    });
  }, [runs, viewState]);

  const selectedRuns = useMemo(
    () => getSelectedRuns(visibleRuns, selectedRunIds),
    [visibleRuns, selectedRunIds],
  );

  const handleToggleRunSelection = useCallback((runId: string) => {
    setSelectedRunIds((prev) => toggleRunSelection(prev, runId));
  }, []);

  const handleToggleAllRunsSelection = useCallback((runIds: string[]) => {
    setSelectedRunIds((prev) => toggleAllRunSelection(prev, runIds));
  }, []);

  const handleBulkAction = useCallback(
    (action: BulkAction, runIds: string[], data?: Record<string, unknown>) => {
      if (action === 'delete') {
        recordAuditEvent({ action: 'run.delete', target: 'runs', metadata: { runCount: runIds.length } });
      }
      setRuns((prev) => applyBulkActionToRuns(prev, action, runIds));

      if (action === 'export' || action === 'tag' || action === 'assign') {
        console.log('Bulk action:', action, runIds, data);
      }

      if (shouldClearSelectionAfterAction(action)) {
        setSelectedRunIds(new Set());
      }
    },
    [],
  );

  return (
    <div className="container-full page-padding fade-in">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="heading-page">Fuzzing Runs</h1>
          <p className="text-meta mt-0.5 sm:mt-1">
            Select runs to cancel, retry, delete, export, tag, or assign in bulk
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {dataState === 'success' && (
            <span className="chip text-xs sm:text-sm">
              {visibleRuns.length === runs.length
                ? `${runs.length} Total Runs`
                : `${visibleRuns.length} of ${runs.length} Runs`}
            </span>
          )}
          <SavedViewsMenu state={viewState} onApply={applyView} />
          <Link href="/" className="btn-outline text-xs sm:text-sm px-3 sm:px-6 h-8 sm:h-10">
            Dashboard
          </Link>
        </div>
      </div>

      <ListState
        {...(dataState === 'loading'
          ? { state: 'loading' }
          : dataState === 'error'
          ? { state: 'error', message: 'Failed to load fuzzing runs', onRetry: () => setFetchAttempt((n) => n + 1) }
          : runs.length === 0
          ? { state: 'empty', message: 'No fuzzing runs found.' }
          : { state: 'success' })}
      >
        <BulkActionsForRuns
          selectedRuns={selectedRuns}
          onAction={handleBulkAction}
          onClearSelection={() => setSelectedRunIds(new Set())}
        />
        <VirtualizedRunTable
          runs={visibleRuns}
          viewportHeight={600}
          visibleColumns={RUN_TABLE_COLUMNS}
          onSelectRun={goToRun}
          onViewReport={(run) => goToRun(run.id)}
          selectedRunIds={selectedRunIds}
          onToggleRunSelection={handleToggleRunSelection}
          onToggleAllRunsSelection={handleToggleAllRunsSelection}
        />
      </ListState>
    </div>
  );
}
