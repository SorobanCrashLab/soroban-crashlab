'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StateInspectorData } from '@/lib/state/normalizeSnapshots';

interface InspectorResponse { data?: StateInspectorData; error?: string }

export function useStateInspector(runId: string) {
  const [data, setData] = useState<StateInspectorData | null>(null);
  const [comparison, setComparison] = useState<StateInspectorData | null>(null);
  const [compareRunId, setCompareRunId] = useState('');
  const [loading, setLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/runs/${encodeURIComponent(id)}/state`, {
      cache: 'no-store', signal, headers: { Accept: 'application/json' },
    });
    const payload = await response.json() as InspectorResponse;
    if (!response.ok || !payload.data) throw new Error(payload.error ?? `State request failed (${response.status}).`);
    return payload.data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(runId, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load state history.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, runId]);

  const compareWithRun = useCallback(async () => {
    const candidate = compareRunId.trim();
    if (!candidate || candidate === runId) {
      setCompareError(candidate === runId ? 'Choose a different run id.' : 'Enter a run id to compare.');
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    try {
      setComparison(await load(candidate));
    } catch (reason) {
      setComparison(null);
      setCompareError(reason instanceof Error ? reason.message : 'Unable to load comparison run.');
    } finally {
      setCompareLoading(false);
    }
  }, [compareRunId, load, runId]);

  const clearComparison = useCallback(() => {
    setComparison(null);
    setCompareError(null);
    setCompareRunId('');
  }, []);

  return {
    data, comparison, compareRunId, setCompareRunId, compareWithRun, clearComparison,
    loading, compareLoading, error, compareError,
  };
}
