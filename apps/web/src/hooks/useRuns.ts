'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FuzzingRun } from '../app/types';
import { fetchRuns } from '../lib/api-client';

export interface UseRunsOptions {
  autoFetch?: boolean;
  revalidateOnFocus?: boolean;
  revalidateOnVisibility?: boolean;
  initialData?: FuzzingRun[];
  pollInterval?: number;
}

export interface UseRunsResult {
  runs: FuzzingRun[];
  total: number;
  dataState: 'loading' | 'success' | 'error';
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setRuns: React.Dispatch<React.SetStateAction<FuzzingRun[]>>;
}

export function useRuns(options: UseRunsOptions = {}): UseRunsResult {
  const {
    autoFetch = true,
    revalidateOnFocus = true,
    revalidateOnVisibility = true,
    initialData = [],
    pollInterval,
  } = options;

  const [runs, setRuns] = useState<FuzzingRun[]>(initialData);
  const [total, setTotal] = useState<number>(initialData.length);
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>(
    initialData.length > 0 ? 'success' : 'loading'
  );
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDataState('loading');
    setError(null);

    try {
      const data = await fetchRuns(controller.signal);
      if (!controller.signal.aborted) {
        setRuns(data.runs ?? []);
        setTotal(data.total ?? (data.runs ?? []).length);
        setDataState('success');
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && (err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err : new Error(String(err)));
        setDataState('error');
      }
    }
  }, []);

  const refetch = useCallback(async () => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    // Initial fetch on mount / refetch. loadData() sets state after the async
    // request settles; calling it from the effect is the intended fetch-on-
    // mount pattern here, so the set-state-in-effect lint rule is waived.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, fetchCount, loadData]);

  useEffect(() => {
    if (!revalidateOnVisibility && !revalidateOnFocus) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && revalidateOnVisibility) {
        void loadData();
      }
    };

    const handleFocus = () => {
      if (revalidateOnFocus) {
        void loadData();
      }
    };

    if (revalidateOnVisibility) {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    if (revalidateOnFocus) {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (revalidateOnVisibility) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (revalidateOnFocus) {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [revalidateOnVisibility, revalidateOnFocus, loadData]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;

    const timer = setInterval(() => {
      void loadData();
    }, pollInterval);

    return () => clearInterval(timer);
  }, [pollInterval, loadData]);

  return {
    runs,
    total,
    dataState,
    isLoading: dataState === 'loading',
    isSuccess: dataState === 'success',
    isError: dataState === 'error',
    error,
    refetch,
    setRuns,
  };
}

export default useRuns;
