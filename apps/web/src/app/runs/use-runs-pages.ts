'use client';

/**
 * Cursor-paged fetcher for the runs table (#1875 / W5-H05).
 *
 * The old page pulled the entire dataset in one request and sorted it in the
 * browser. This hook keeps a growing window of rows in memory and appends the
 * next keyset page when the virtualized table reaches its end — so scrolling
 * is what fetches data, and the API stays the single source of truth for
 * ordering (sort key + id tiebreak, see `runs-sort-utils.ts`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRuns } from '@/lib/api-client';
import type { FuzzingRun } from '../types';
import {
  isRunSortField,
  type RunSortDirection,
  type RunSortField,
} from '../runs-sort-utils';

export type RunsDataState = 'loading' | 'success' | 'error';

export interface UseRunsPagesOptions {
  /** Requested sort key; unknown values fall back to `queuedAt`. */
  sortKey?: string | null;
  /** `none` maps to the server default (newest queued first). */
  sortDirection?: RunSortDirection | 'none';
  /** Rows requested per page (default 200; server caps at 500). */
  pageSize?: number;
}

export interface UseRunsPagesResult {
  /** Rows loaded so far, already in server sort order. */
  runs: FuzzingRun[];
  /** Total matching rows known to the API (across every page). */
  total: number | null;
  hasMore: boolean;
  /** A first page (or refresh) is in flight. */
  isLoading: boolean;
  /** The next page is being appended. */
  isLoadingMore: boolean;
  dataState: RunsDataState;
  error: string | null;
  /** Which fetch produced `error`, so the UI can keep a loaded list usable. */
  errorKind: 'initial' | 'more' | null;
  loadMore: () => void;
  /** Re-run the first page (pull-to-refresh, visibility revalidate, retry). */
  refresh: () => void;
  /**
   * Apply a local, optimistic update (bulk actions mutate rows without a
   * refetch). Cleared automatically when the sort changes or a page reloads.
   */
  mutateRuns: (updater: (previous: FuzzingRun[]) => FuzzingRun[]) => void;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Failed to load runs';
}

export function useRunsPages(options: UseRunsPagesOptions = {}): UseRunsPagesResult {
  const { sortKey, sortDirection = 'none', pageSize = 200 } = options;

  const sortField: RunSortField = isRunSortField(sortKey) ? sortKey : 'queuedAt';
  const order: RunSortDirection = sortDirection === 'asc' ? 'asc' : 'desc';

  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dataState, setDataState] = useState<RunsDataState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'initial' | 'more' | null>(null);

  // The cursor for the *current* list; mirrors `hasMore` without stale
  // closures inside event handlers.
  const cursorRef = useRef<string | null>(null);
  // Monotonic token: any in-flight response with a stale token is discarded
  // (sort changed, refresh, unmount).
  const generationRef = useRef(0);
  const moreControllerRef = useRef<AbortController | null>(null);

  const applyFirstPage = useCallback(
    (payload: { runs: FuzzingRun[]; total?: number; nextCursor?: string | null; hasMore?: boolean }) => {
      const list = Array.isArray(payload.runs) ? payload.runs : [];
      cursorRef.current = payload.nextCursor ?? null;
      setRuns(list);
      setTotal(typeof payload.total === 'number' ? payload.total : list.length);
      setHasMore(Boolean(payload.hasMore) && Boolean(payload.nextCursor));
      setDataState('success');
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      setErrorKind(null);
    },
    [],
  );

  const loadFirst = useCallback(async (signal: AbortSignal) => {
    try {
      const payload = await fetchRuns(
        { limit: pageSize, sort: sortField, order },
        signal,
      );
      if (signal.aborted) return;
      applyFirstPage(payload);
    } catch (err) {
      if (signal.aborted) return;
      setError(messageOf(err));
      setErrorKind('initial');
      setDataState('error');
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [applyFirstPage, order, pageSize, sortField]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore || !cursorRef.current) return;

    const generation = generationRef.current;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setIsLoadingMore(true);
    setErrorKind(null);

    fetchRuns(
      { cursor: cursorRef.current, limit: pageSize, sort: sortField, order },
      controller.signal,
    )
      .then((payload) => {
        if (generation !== generationRef.current) return;
        cursorRef.current = payload.nextCursor ?? null;
        setRuns((previous) => {
          const seen = new Set(previous.map((run) => run.id));
          const appended = (payload.runs ?? []).filter((run) => !seen.has(run.id));
          return appended.length > 0 ? [...previous, ...appended] : previous;
        });
        setTotal(typeof payload.total === 'number' ? payload.total : null);
        setHasMore(Boolean(payload.hasMore) && Boolean(payload.nextCursor));
        setIsLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        setError(messageOf(err));
        setErrorKind('more');
        setIsLoadingMore(false);
      });
  }, [isLoading, isLoadingMore, hasMore, order, pageSize, sortField]);

  // Reset + load whenever the sort (or page size) changes.
  useEffect(() => {
    generationRef.current += 1;
    const controller = new AbortController();
    moreControllerRef.current?.abort();
    moreControllerRef.current = null;
    cursorRef.current = null;

    // Stale rows from the previous ordering would show wrong order; clear them
    // so the table re-renders from an empty, loading state.
    setRuns([]);
    setTotal(null);
    setHasMore(false);
    setIsLoading(true);
    setIsLoadingMore(false);
    setDataState('loading');
    setError(null);
    setErrorKind(null);

    void loadFirst(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadFirst]);

  const refresh = useCallback(() => {
    generationRef.current += 1;
    const controller = new AbortController();
    cursorRef.current = null;
    setIsLoading(true);
    setError(null);
    setErrorKind(null);
    void loadFirst(controller.signal);
  }, [loadFirst]);

  const mutateRuns = useCallback(
    (updater: (previous: FuzzingRun[]) => FuzzingRun[]) => {
      setRuns((previous) => updater(previous));
    },
    [],
  );

  return {
    runs,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    dataState,
    error,
    errorKind,
    loadMore,
    refresh,
    mutateRuns,
  };
}
