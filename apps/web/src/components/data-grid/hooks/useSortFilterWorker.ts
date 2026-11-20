'use client';

/**
 * Hook for Web Worker communication in the data grid (#2190).
 *
 * Falls back to main-thread execution when Workers are unavailable.
 * Uses the comlink-wrapper for typed RPC.
 */

import { useState, useCallback, useRef } from 'react';
import { wrap } from '../workers/comlink-wrapper';
import { api as workerAPI, type SortFilterWorkerAPI } from '../workers/sortFilterWorker';
import { WORKER_FALLBACK_THRESHOLD } from '../constants';
import type { FuzzingRun } from '@/app/types';
import type { RunFilters } from '@/app/run-filter-utils';

export function useSortFilterWorker() {
  const [isUsingWorker, setIsUsingWorker] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const wrappedAPI = useRef<SortFilterWorkerAPI | null>(null);

  // Initialize Worker lazily — only when data exceeds threshold.
  const ensureWorker = useCallback((): SortFilterWorkerAPI => {
    if (wrappedAPI.current) return wrappedAPI.current;
    // Try to create a Worker (may fail in environments without Worker support).
    try {
      if (typeof Worker !== 'undefined') {
        const worker = new Worker(new URL('../workers/sortFilterWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        wrappedAPI.current = wrap<SortFilterWorkerAPI>(worker);
        setIsUsingWorker(true);
        return wrappedAPI.current;
      }
    } catch {
      // Fall back to main thread.
    }
    // Main-thread fallback: use the API directly.
    wrappedAPI.current = workerAPI;
    setIsUsingWorker(false);
    return wrappedAPI.current;
  }, []);

  const sort = useCallback(
    (data: FuzzingRun[], field: string, direction: 'asc' | 'desc') => {
      if (data.length >= WORKER_FALLBACK_THRESHOLD) {
        const api = ensureWorker();
        return api.sort(data, field, direction);
      }
      return workerAPI.sort(data, field, direction);
    },
    [ensureWorker],
  );

  const filter = useCallback(
    (data: FuzzingRun[], filters: RunFilters) => {
      if (data.length >= WORKER_FALLBACK_THRESHOLD) {
        const api = ensureWorker();
        return api.filter(data, filters);
      }
      return workerAPI.filter(data, filters);
    },
    [ensureWorker],
  );

  const aggregate = useCallback(
    (data: FuzzingRun[], field: string) => {
      if (data.length >= WORKER_FALLBACK_THRESHOLD) {
        const api = ensureWorker();
        return api.aggregate(data, field);
      }
      return workerAPI.aggregate(data, field);
    },
    [ensureWorker],
  );

  return { sort, filter, aggregate, isUsingWorker };
}
