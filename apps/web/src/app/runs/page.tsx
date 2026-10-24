'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { captureRunListContext } from './swipe/run-list-context';
import type { BulkAction } from '../../features/runs/add-bulk-actions-for-runs';
import {
  applyBulkActionToRuns,
  getSelectedRuns,
  shouldClearSelectionAfterAction,
} from '../runs-bulk-actions-utils';
import { FuzzingRun } from '../types';
import { recordAuditEvent } from '../../lib/audit/audit-sink';
import SavedViewsMenu from '../saved-views/SavedViewsMenu';
import {
  createDefaultViewState,
  decodeViewState,
  encodeViewState,
  type SortDirection,
  type ViewState,
} from '../saved-views/view-state';
import { getNextSortState, type SortOrder, type SortState } from '../run-history-sort-utils';
import { applyRunFilters } from '../run-filter-utils';
import type { RunArea, RunSeverity, RunStatus } from '../types';
import { compareRuns, isRunSortField } from '../runs-sort-utils';
import { useRunsPages } from './use-runs-pages';
import {
  applyFilterContext,
  clearRunSelection,
  createRunSelectionState,
  getSelectAllLabel,
  getSelectionAnnouncement,
  getSelectionCount,
  isRunSelected,
  selectAllLoaded,
  selectAllMatching,
  toggleRunSelection as toggleStoredSelection,
  type RunSelectionState,
} from './selection-store';
import { LoadingSpinner } from '../../components/LoadingSkeleton';
import { ListState } from '../../components/ListState';
import { PageHeader } from '../../components/PageHeader';
import { PullToRefreshIndicator } from '../../components/PullToRefreshIndicator';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

const BulkActionsForRuns = dynamic(() => import('../../features/runs/add-bulk-actions-for-runs'), {
  loading: () => <LoadingSpinner />,
});
const VirtualizedRunTable = dynamic(
  () => import('../../features/runs/implement-virtualized-run-table-component'),
  { loading: () => <LoadingSpinner /> },
);

const RUN_TABLE_COLUMNS = ['id', 'status', 'area', 'severity', 'duration', 'seedCount'];

/** Rows requested per cursor page. Deep scrolls append 200 at a time. */
const RUNS_PAGE_SIZE = 200;

export default function RunsPage() {
  const router = useRouter();
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

  // ── Data: cursor paging, server-side sort (#1875) ─────────────────────────
  const {
    runs,
    total,
    hasMore,
    isLoadingMore,
    dataState,
    loadMore,
    refresh,
    mutateRuns,
  } = useRunsPages({
    sortKey: viewState.sort.key,
    sortDirection: viewState.sort.direction,
    pageSize: RUNS_PAGE_SIZE,
  });

  // Revalidate when the tab becomes visible again (stale rows after returning).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const currentSortState: SortState<string> = useMemo(
    () => ({
      field: viewState.sort.direction === 'none' ? null : viewState.sort.key || null,
      order: (viewState.sort.direction as SortOrder) || 'none',
    }),
    [viewState.sort.key, viewState.sort.direction],
  );

  const handleSort = useCallback(
    (field: string) => {
      const current: SortState<string> = {
        field: viewState.sort.direction === 'none' ? null : viewState.sort.key || null,
        order: (viewState.sort.direction as SortOrder) || 'none',
      };
      const next = getNextSortState(current, field);
      applyView({
        ...viewState,
        sort: {
          key: next.field ?? '',
          direction: next.order as SortDirection,
        },
      });
    },
    [viewState, applyView],
  );

  const visibleRuns = useMemo(() => {
    const filtered = applyRunFilters(runs, {
      status: viewState.filters.status as RunStatus[],
      area: viewState.filters.area as RunArea[],
      severity: viewState.filters.severity as RunSeverity[],
      searchTerm: viewState.search,
      hasCrash: viewState.filters.hasCrash,
    });

    if (viewState.sort.direction === 'none' || !isRunSortField(viewState.sort.key)) {
      return filtered;
    }

    // Display sort mirrors the server comparator (including the id tiebreak) so
    // a keyset page boundary can never show a different order than the cursor.
    const field = viewState.sort.key;
    const direction = viewState.sort.direction;
    return filtered.slice().sort((a, b) => compareRuns(a, b, field, direction));
  }, [runs, viewState]);

  // ── Selection: id-keyed, survives paging, query-based select-all (#1875) ──
  const [selection, setSelection] = useState<RunSelectionState>(createRunSelectionState);

  const filtersActive =
    Boolean(viewState.search) ||
    (viewState.filters.status?.length ?? 0) > 0 ||
    (viewState.filters.area?.length ?? 0) > 0 ||
    (viewState.filters.severity?.length ?? 0) > 0 ||
    Boolean(viewState.filters.hasCrash);

  const filterQueryKey = useMemo(
    () =>
      JSON.stringify({
        status: viewState.filters.status,
        area: viewState.filters.area,
        severity: viewState.filters.severity,
        search: viewState.search,
        hasCrash: viewState.filters.hasCrash,
      }),
    [viewState.filters, viewState.search],
  );

  /**
   * Number of runs a query-based selection covers. Filters are applied
   * client-side, so with active filters we can only count loaded matches;
   * without filters the API total is authoritative.
   */
  const selectionMatchTotal = filtersActive ? visibleRuns.length : (total ?? visibleRuns.length);

  // Invalidate "all matching" selections when the filter identity changes.
  useEffect(() => {
    setSelection((previous) => applyFilterContext(previous, filterQueryKey, selectionMatchTotal));
  }, [filterQueryKey, selectionMatchTotal]);

  const selectedRunIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of visibleRuns) {
      if (isRunSelected(selection, run.id)) ids.add(run.id);
    }
    return ids;
  }, [visibleRuns, selection]);

  const selectedRuns = useMemo(
    () => getSelectedRuns(visibleRuns, selectedRunIds),
    [visibleRuns, selectedRunIds],
  );

  const selectionCount = getSelectionCount(selection);

  // Declared after `visibleRuns` because it closes over it: hoisting the
  // callback above the `useMemo` read the binding in its temporal dead zone.
  const goToRun = useCallback((runId: string) => {
    captureRunListContext(
      visibleRuns.map((r) => r.id),
      {
        // The stored context is a flat string map, so multi-select filters are
        // joined rather than passed through as arrays.
        status: (viewState.filters.status ?? []).join(','),
        area: (viewState.filters.area ?? []).join(','),
        severity: (viewState.filters.severity ?? []).join(','),
        searchTerm: viewState.search,
      },
      viewState.sort,
    );
    router.push(`/runs/${runId}`);
  }, [router, visibleRuns, viewState]);

  const handleToggleRunSelection = useCallback((runId: string) => {
    setSelection((previous) => toggleStoredSelection(previous, runId));
  }, []);

  const handleToggleAllRunsSelection = useCallback((runIds: string[]) => {
    setSelection((previous) => {
      const everythingVisibleSelected =
        runIds.length > 0 && runIds.every((id) => isRunSelected(previous, id));

      if (everythingVisibleSelected) {
        return clearRunSelection(previous);
      }

      // More rows exist than are loaded: select the whole matching query, with
      // a count preview, instead of only the current page.
      if (selectionMatchTotal > runIds.length) {
        return selectAllMatching(previous, {
          queryKey: filterQueryKey,
          matchingCount: selectionMatchTotal,
        });
      }

      return selectAllLoaded(previous, runIds);
    });
  }, [filterQueryKey, selectionMatchTotal]);

  const handleBulkAction = useCallback(
    (action: BulkAction, runIds: string[], data?: Record<string, unknown>) => {
      if (action === 'delete') {
        recordAuditEvent({ action: 'run.delete', target: 'runs', metadata: { runCount: runIds.length } });
      }
      mutateRuns((previous) => applyBulkActionToRuns(previous, action, runIds));

      if (action === 'export' || action === 'tag' || action === 'assign') {
        console.log('Bulk action:', action, runIds, data);
      }

      if (shouldClearSelectionAfterAction(action)) {
        setSelection((previous) => clearRunSelection(previous));
      }
    },
    [mutateRuns],
  );

  const handleRefresh = useCallback(async () => {
    refresh();
    // Give the request time to kick off before resolving the pull gesture.
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
  }, [refresh]);

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: dataState === 'loading',
  });

  const rowCountForAnnouncements = filtersActive
    ? visibleRuns.length
    : Math.max(total ?? 0, visibleRuns.length);

  return (
    <div className="container-full page-padding fade-in">
      <PullToRefreshIndicator isPulling={isPulling} isRefreshing={isRefreshing} pullDistance={pullDistance} />
      <PageHeader
        title="Fuzzing Runs"
        description="Select runs to cancel, retry, delete, export, tag, or assign in bulk"
        actions={
          <>
            {dataState === 'success' && (
              <span className="chip text-xs sm:text-sm">
                {visibleRuns.length === runs.length && !hasMore
                  ? `${runs.length} Total Runs`
                  : `${visibleRuns.length} of ${rowCountForAnnouncements} Runs`}
              </span>
            )}
            <SavedViewsMenu state={viewState} onApply={applyView} />
            <Link href="/" className="btn-outline text-xs sm:text-sm px-3 sm:px-6 h-8 sm:h-10">
              Dashboard
            </Link>
          </>
        }
      />

      <ListState
        {...(dataState === 'loading'
          ? { state: 'loading' }
          : dataState === 'error'
          ? { state: 'error', message: 'Failed to load fuzzing runs', onRetry: refresh }
          : runs.length === 0
          ? {
              state: 'empty',
              type: 'runs',
              message: 'No fuzzing runs yet',
              description: 'Upload your contract .wasm file, pick the functions to fuzz, and launch your first run. It takes about two minutes.',
              action: (
                <Link href="/start" className="btn-primary text-xs sm:text-sm px-4 py-2 inline-flex items-center">
                  Upload a contract and start your first run
                </Link>
              ),
            }
          : { state: 'success' })}
      >
        <BulkActionsForRuns
          selectedRuns={selectedRuns}
          selectionCount={selectionCount}
          onAction={handleBulkAction}
          onClearSelection={() => setSelection((previous) => clearRunSelection(previous))}
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
          sortState={currentSortState}
          onSort={handleSort}
          totalCount={rowCountForAnnouncements}
          hasMore={hasMore}
          loadingMore={isLoadingMore}
          onEndReached={loadMore}
          scrollResetKey={`${filterQueryKey}|${viewState.sort.key}|${viewState.sort.direction}`}
          selectedCount={selectionCount}
          selectAllLabel={getSelectAllLabel(selection, visibleRuns.length, selectionMatchTotal)}
          allMatchingSelected={selection.mode === 'all-matching'}
          selectionAnnouncement={getSelectionAnnouncement(selection)}
        />
      </ListState>
    </div>
  );
}
