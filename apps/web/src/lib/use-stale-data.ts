'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Options for `useStaleData`.
 */
export interface StaleDataOptions<T> {
  /**
   * Async function that returns fresh data. Should be stable (memoized with
   * useCallback) or defined outside the component so it doesn't trigger
   * unnecessary refetches.
   */
  fetcher: (signal: AbortSignal) => Promise<T>;
  /**
   * How often to revalidate in the background, in milliseconds.
   * Defaults to 0 (no automatic polling; only revalidate on mount and on
   * explicit `refresh()` calls).
   */
  revalidateIntervalMs?: number;
  /**
   * Whether to skip the initial fetch on mount. Useful for deferred loading.
   * Defaults to false.
   */
  skip?: boolean;
}

export type StaleDataState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; isStale: boolean; isRevalidating: boolean }
  | { status: 'error'; error: unknown; staleData?: T };

/**
 * Stale-while-revalidate data fetching hook (#1886).
 *
 * Behaviour:
 * - First load: status="loading" until the first successful response.
 * - Subsequent refreshes: keeps previously fetched data visible with
 *   `isStale=true` + `isRevalidating=true` while a background fetch runs,
 *   so pages never flash to empty on navigation or revalidation.
 * - Background fetch failure: transitions to status="error" but retains
 *   staleData so the caller can still render the last-known state.
 * - Request cancellation: inflight fetch is aborted when the component
 *   unmounts or `skip` becomes true to prevent state updates after unmount.
 */
export function useStaleData<T>(options: StaleDataOptions<T>): StaleDataState<T> & { refresh: () => void } {
  const { fetcher, revalidateIntervalMs = 0, skip = false } = options;

  const [state, setState] = useState<StaleDataState<T>>({ status: 'idle' });
  // Keep last good data for stale-while-revalidate.
  const lastDataRef = useRef<T | undefined>(undefined);
  // Track whether a fetch is in progress to avoid overlapping fetches.
  const fetchingRef = useRef(false);
  // Stable ref to the latest fetcher so the interval doesn't close over a stale one.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(
    (controller: AbortController) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const hasStale = lastDataRef.current !== undefined;

      setState((prev) => {
        if (prev.status === 'success') {
          return { ...prev, isRevalidating: true, isStale: true };
        }
        if (hasStale) {
          return {
            status: 'success',
            data: lastDataRef.current as T,
            isStale: true,
            isRevalidating: true,
          };
        }
        return { status: 'loading' };
      });

      fetcherRef.current(controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          lastDataRef.current = data;
          fetchingRef.current = false;
          setState({ status: 'success', data, isStale: false, isRevalidating: false });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          fetchingRef.current = false;
          setState((prev) => ({
            status: 'error',
            error: err,
            staleData:
              prev.status === 'success'
                ? prev.data
                : lastDataRef.current,
          }));
        });
    },
    [],
  );

  // Track the current AbortController so `refresh()` can cancel a running fetch.
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    // Abort any in-flight request.
    controllerRef.current?.abort();
    fetchingRef.current = false;
    const controller = new AbortController();
    controllerRef.current = controller;
    doFetch(controller);
  }, [doFetch]);

  useEffect(() => {
    if (skip) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    doFetch(controller);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (revalidateIntervalMs > 0) {
      intervalId = setInterval(() => {
        if (!controller.signal.aborted) {
          const revalController = new AbortController();
          controllerRef.current = revalController;
          doFetch(revalController);
        }
      }, revalidateIntervalMs);
    }

    return () => {
      controller.abort();
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [skip, revalidateIntervalMs, doFetch]);

  return { ...state, refresh };
}
