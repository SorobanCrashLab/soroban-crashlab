"use client";

import { useCallback, useEffect, useState } from 'react';
import type { RunbookExecution, RunbookRole, RunbookTemplate } from '../model';

export type RunbookListItem = RunbookTemplate & { stale: boolean; freshness: string };

/** Demo identity; replace with the signed-in user once auth is available. */
export interface Identity {
  user: string;
  role: RunbookRole;
}

function headers(identity: Identity): HeadersInit {
  return { 'content-type': 'application/json', 'x-crashlab-user': identity.user, 'x-crashlab-role': identity.role };
}

export function useRunbooks(identity: Identity, query = '') {
  const [runbooks, setRunbooks] = useState<RunbookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runbooks${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      if (!res.ok) throw new Error(`Failed to load runbooks (${res.status})`);
      setRunbooks((await res.json()).runbooks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runbooks');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = useCallback(
    async (templateId: string, context: { source: string; refId?: string } = { source: 'manual' }) => {
      const res = await fetch('/api/runbooks/executions', { method: 'POST', headers: headers(identity), body: JSON.stringify({ action: 'start', templateId, context }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start runbook');
      return data.execution as RunbookExecution;
    },
    [identity],
  );

  return { runbooks, loading, error, refresh, start };
}

export function useExecution(id: string, identity: Identity) {
  const [state, setState] = useState<{ execution: RunbookExecution; template: RunbookTemplate } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runbooks/executions?id=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError('Execution not found');
      return;
    }
    const data = await res.json();
    setState({ execution: data.execution, template: data.template });
  }, [id]);

  useEffect(() => {
    // Poll so collaborators see each other's progress; executions are resumable.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/runbooks/executions', { method: 'POST', headers: headers(identity), body: JSON.stringify({ id, ...payload }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed');
        return;
      }
      setError(null);
      if (data.preview) setPreview(data.preview);
      await load();
    },
    [id, identity, load],
  );

  return { ...state, error, preview, act };
}
