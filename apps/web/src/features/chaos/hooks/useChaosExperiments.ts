'use client';

/**
 * Client data layer for the Chaos Control Center (#2340). Live detail is
 * polled every 2 s while an experiment is running; control responses are
 * applied immediately so the abort button reflects reality without waiting
 * for the next poll.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ExperimentAnalysis } from '../lib/analysis';
import type { PreflightResult } from '../lib/guardrails';
import type { InventoryTarget, MaintenanceWindow } from '../lib/inventory';
import type { ControlAction, ControlInput } from '../lib/lifecycle';
import type { ExperimentDefinition, ExperimentRecord, ExperimentStatus, TargetRef } from '../lib/model';
import type { TelemetrySample } from '../lib/monitor';
import type { ExperimentTemplate } from '../lib/templates';

export interface Viewer {
  subject: string;
  role: 'anonymous' | 'analyst' | 'maintainer';
}

export interface ExperimentSummary {
  id: string;
  name: string;
  status: ExperimentStatus;
  version: number;
  fingerprint: string;
  targets: TargetRef[];
  createdBy: string;
  startedAt: string | null;
  endedAt: string | null;
  allowedActions: ControlAction[];
}

export interface ListPayload {
  viewer: Viewer;
  executor: 'simulated' | 'live';
  experiments: ExperimentSummary[];
  templates: ExperimentTemplate[];
  inventory: InventoryTarget[];
  maintenanceWindows: MaintenanceWindow[];
}

export interface DetailPayload {
  viewer: Viewer;
  executor: 'simulated' | 'live';
  experiment: ExperimentRecord;
  preflight: PreflightResult;
  samples: TelemetrySample[];
  analysis: ExperimentAnalysis | null;
  allowedActions: ControlAction[];
  serverTime: string;
}

export const POLL_MS = 2_000;

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: string | { message?: string }; preflight?: PreflightResult };
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    const error = new Error(message ?? `Request failed (${response.status}).`) as Error & { preflight?: PreflightResult };
    error.preflight = payload.preflight;
    throw error;
  }
  return payload.data as T;
}

export function useChaosExperiments() {
  const [list, setList] = useState<{ data: ListPayload | null; error: string | null; revision: number }>({ data: null, error: null, revision: -1 });
  const [detail, setDetail] = useState<{ id: string | null; data: DetailPayload | null; error: string | null }>({ id: null, data: null, error: null });
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedPreflight, setFailedPreflight] = useState<PreflightResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<ListPayload>('/api/chaos/experiments')
      .then((data) => !cancelled && setList({ data, error: null, revision }))
      .catch((error: Error) => !cancelled && setList((previous) => ({ ...previous, error: error.message, revision })));
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const running = detail.data?.experiment.status === 'running';
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () =>
      call<DetailPayload>(`/api/chaos/experiments/${encodeURIComponent(selectedId)}/control`)
        .then((data) => !cancelled && setDetail({ id: selectedId, data, error: null }))
        .catch((error: Error) => !cancelled && setDetail({ id: selectedId, data: null, error: error.message }));
    void load();
    const timer = running ? setInterval(() => void load(), POLL_MS) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [revision, running, selectedId]);

  const run = useCallback(async <T,>(work: () => Promise<T>, success: string): Promise<T | null> => {
    setBusy(true);
    setFailedPreflight(null);
    try {
      const result = await work();
      setNotice({ kind: 'success', text: success });
      setRevision((value) => value + 1);
      return result;
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message });
      setFailedPreflight((error as { preflight?: PreflightResult }).preflight ?? null);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(
    async (definition: ExperimentDefinition, id?: string) => {
      const result = await run(() => call<{ experiment: ExperimentRecord }>('/api/chaos/experiments', { action: 'save', id, definition }), `Saved “${definition.name}”.`);
      if (result) setSelectedId(result.experiment.id);
      return result?.experiment ?? null;
    },
    [run],
  );

  const dryRun = useCallback(async (definition: ExperimentDefinition) => {
    try {
      setNotice(null);
      return await call<PreflightResult & { fingerprint: string }>('/api/chaos/experiments', { action: 'dry-run', definition });
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message });
      return null;
    }
  }, []);

  const control = useCallback(
    async (id: string, input: ControlInput) => {
      const result = await run(
        () => call<{ experiment: ExperimentRecord; allowedActions: ControlAction[] }>(`/api/chaos/experiments/${encodeURIComponent(id)}/control`, input),
        `${input.action[0].toUpperCase()}${input.action.slice(1)} applied.`,
      );
      if (result) {
        setDetail((previous) =>
          previous.id === id && previous.data ? { ...previous, data: { ...previous.data, experiment: result.experiment, allowedActions: result.allowedActions } } : previous,
        );
      }
      return result;
    },
    [run],
  );

  const abortAll = useCallback(
    (reason: string) => run(() => call<{ aborted: string[] }>('/api/chaos/experiments', { action: 'abort-all', reason }), 'Emergency stop sent to all active experiments.'),
    [run],
  );

  return {
    list: list.data,
    listError: list.error,
    listLoading: list.revision !== revision,
    viewer: list.data?.viewer ?? null,
    selectedId,
    select: setSelectedId,
    detail: detail.id === selectedId ? detail.data : null,
    detailError: detail.id === selectedId ? detail.error : null,
    notice,
    dismissNotice: () => setNotice(null),
    busy,
    failedPreflight,
    save,
    dryRun,
    control,
    abortAll,
  };
}

export type ChaosState = ReturnType<typeof useChaosExperiments>;
