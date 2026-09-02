'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RunIssueLink } from '../app/types';
import { api } from '../lib/api-client';

export interface UseIssuesOptions {
  autoFetch?: boolean;
  initialIssues?: RunIssueLink[];
}

export interface UseIssuesResult {
  issues: RunIssueLink[];
  dataState: 'loading' | 'success' | 'error';
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  addIssue: (link: RunIssueLink) => Promise<boolean>;
  removeIssue: (href: string) => Promise<boolean>;
  refetch: () => Promise<void>;
  setIssues: React.Dispatch<React.SetStateAction<RunIssueLink[]>>;
}

export function useIssues(
  runId: string | undefined | null,
  options: UseIssuesOptions = {}
): UseIssuesResult {
  const { autoFetch = true, initialIssues = [] } = options;

  const [issues, setIssues] = useState<RunIssueLink[]>(initialIssues);
  const [dataState, setDataState] = useState<'loading' | 'success' | 'error'>(
    initialIssues.length > 0 ? 'success' : 'loading'
  );
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (!runId) {
      setIssues([]);
      setDataState('success');
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
      const data = await api.runs.issues.list(runId, controller.signal);
      if (!controller.signal.aborted) {
        setIssues(data.issues ?? []);
        setDataState('success');
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && (err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err : new Error(String(err)));
        setDataState('error');
      }
    }
  }, [runId]);

  const refetch = useCallback(async () => {
    setFetchCount((c) => c + 1);
  }, []);

  const addIssue = useCallback(
    async (link: RunIssueLink): Promise<boolean> => {
      if (!runId) return false;
      try {
        const res = await api.runs.issues.add(runId, link);
        setIssues(res.issues ?? []);
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },
    [runId]
  );

  const removeIssue = useCallback(
    async (href: string): Promise<boolean> => {
      if (!runId) return false;
      try {
        const res = await api.runs.issues.remove(runId, href);
        setIssues(res.issues ?? []);
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },
    [runId]
  );

  useEffect(() => {
    if (!autoFetch || !runId) return;

    const timer = setTimeout(() => {
      // Deferred so the effect body performs no synchronous state update
      // (react-hooks/set-state-in-effect).
      void loadData();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, runId, fetchCount, loadData]);

  return {
    issues,
    dataState,
    isLoading: dataState === 'loading',
    isSuccess: dataState === 'success',
    isError: dataState === 'error',
    error,
    addIssue,
    removeIssue,
    refetch,
    setIssues,
  };
}

export default useIssues;
