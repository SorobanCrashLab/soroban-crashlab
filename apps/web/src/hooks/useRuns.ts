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
  staleTime?: number;
  cacheTime?: number;
}

export interface UseRunsResult {
  runs: FuzzingRun[];
  total: number;
  dataState: 'loading' | 'success' | 'error';
  isLoading: boolean;
  isValidating: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  mutate: (data?: FuzzingRun[]) => void;
  setRuns: React.Dispatch<React.SetStateAction<FuzzingRun[]>>;
}

type CacheEntry = {
  runs: FuzzingRun[];
  total: number;
  timestamp: number;
};

const CACHE_KEY = '__runs_cache__';
const DEFAULT_STALE_TIME = 30_000;
const DEFAULT_CACHE_TIME = 5 * 60_000;

const runsCache = new Map<string, CacheEntry>();

function getCached(): CacheEntry | undefined {
  return runsCache.get(CACHE_KEY);
}

function setCached(runs: FuzzingRun[], total: number): void {
  runsCache.set(CACHE_KEY, { runs, total, timestamp: Date.now() });
}

function isStale(entry: CacheEntry | undefined, staleTime: number): boolean {
  if (!entry) return true;
  return Date.now() - entry.timestamp > staleTime;
}

export function useRuns(options: UseRunsOptions = {}): UseRunsResult {
  const {
    autoFetch = true,
    revalidateOnFocus = true,
    revalidateOnVisibility = true,
    initialData = [],
    pollInterval,
    staleTime = DEFAULT_STALE_TIME,
    cacheTime = DEFAULT_CACHE_TIME,
  } = options;

  const cached = getCached();
  // eslint-disable-next-line react-hooks/purity
  const hasCache = Boolean(cached && Date.now() - cached.timestamp < cacheTime);
  const initialRuns = initialData.length > 0 ? initialData : hasCache ? cached!.runs : [];
  const initialTotal = initialData.length > 0 ? initialData.length : hasCache ? cached!.total : 0;

  const [runs, setRuns] = useState<FuzzingRun[]>(initialRuns);
  const [total, setTotal] = useState<number>(initialTotal);
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>(
    initialRuns.length > 0 ? 'success' : 'loading'
  );
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const cachedEntry = getCached();
    const hasStaleCache = Boolean(cachedEntry);
    if (hasStaleCache) {
      setIsValidating(true);
    } else {
      setDataState('loading');
    }
    setError(null);

    try {
      const data = await fetchRuns(controller.signal);
      if (!controller.signal.aborted) {
        const nextRuns = data.runs ?? [];
        const nextTotal = data.total ?? nextRuns.length;
        setRuns(nextRuns);
        setTotal(nextTotal);
        setCached(nextRuns, nextTotal);
        setDataState('success');
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && (err as Error)?.name !== 'AbortError') {
        if (!hasStaleCache) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setDataState('error');
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsValidating(false);
      }
    }
  }, []);

  const refetch = useCallback(async () => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    const cachedEntry = getCached();
    const shouldRevalidate = fetchCount > 0 || isStale(cachedEntry, staleTime);
    if (!shouldRevalidate && cachedEntry) {
      return;
    }
    // Initial fetch on mount / refetch. loadData() sets state after the async
    // request settles; calling it from the effect is the intended fetch-on-
    // mount pattern here, so the set-state-in-effect lint rule is waived.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, fetchCount, loadData, staleTime]);

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

  const mutate = useCallback((data?: FuzzingRun[]) => {
    if (data) {
      setRuns(data);
      setTotal(data.length);
      setCached(data, data.length);
      setDataState('success');
    } else {
      void loadData();
    }
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      const entry = getCached();
      if (entry && Date.now() - entry.timestamp > cacheTime) {
        runsCache.delete(CACHE_KEY);
      }
    }, cacheTime);
    return () => clearInterval(interval);
  }, [cacheTime]);

  return {
    runs,
    total,
    dataState,
    isLoading: dataState === 'loading' && !isValidating,
    isValidating,
    isSuccess: dataState === 'success',
    isError: dataState === 'error',
    error,
    refetch,
    mutate,
    setRuns,
  };
}

export function clearRunsCache(): void {
  runsCache.delete(CACHE_KEY);
}

export default useRuns;
