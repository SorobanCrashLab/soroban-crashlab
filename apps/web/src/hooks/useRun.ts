'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FuzzingRun } from '../app/types';
import { fetchRun } from '../lib/api-client';

export interface UseRunOptions {
  autoFetch?: boolean;
  initialData?: FuzzingRun | null;
  pollInterval?: number;
}

export interface UseRunResult {
  run: FuzzingRun | null;
  dataState: 'loading' | 'success' | 'error';
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setRun: React.Dispatch<React.SetStateAction<FuzzingRun | null>>;
}

export function useRun(
  id: string | undefined | null,
  options: UseRunOptions = {}
): UseRunResult {
  const { autoFetch = true, initialData = null, pollInterval } = options;

  const [run, setRun] = useState<FuzzingRun | null>(initialData);
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>(
    initialData ? 'success' : 'loading'
  );
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setRun(null);
      setDataState('error');
      setError(new Error('No run ID provided'));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDataState('loading');
    setError(null);

    try {
      const data = await fetchRun(id, controller.signal);
      if (!controller.signal.aborted) {
        setRun(data);
        setDataState('success');
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && (err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err : new Error(String(err)));
        setDataState('error');
      }
    }
  }, [id]);

  const refetch = useCallback(async () => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!autoFetch || !id) return;
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
  }, [autoFetch, id, fetchCount, loadData]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0 || !id) return;

    const timer = setInterval(() => {
      void loadData();
    }, pollInterval);

    return () => clearInterval(timer);
  }, [pollInterval, id, loadData]);

  return {
    run,
    dataState,
    isLoading: dataState === 'loading',
    isSuccess: dataState === 'success',
    isError: dataState === 'error',
    error,
    refetch,
    setRun,
  };
}

export default useRun;
