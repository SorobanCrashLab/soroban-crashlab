"use client";

import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, CorrelationArtifact, CorrelationLink, InvestigationSet } from '@/lib/correlation/model';

export interface CorrelationIdentity {
  user: string;
  role: 'viewer' | 'responder' | 'maintainer';
}

function headers(id: CorrelationIdentity): HeadersInit {
  return { 'content-type': 'application/json', 'x-crashlab-user': id.user, 'x-crashlab-role': id.role };
}

export function useCorrelation(identity: CorrelationIdentity, focusId: string | null) {
  const [artifacts, setArtifacts] = useState<CorrelationArtifact[]>([]);
  const [links, setLinks] = useState<CorrelationLink[]>([]);
  const [sets, setSets] = useState<InvestigationSet[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [suggestions, setSuggestions] = useState<CorrelationLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        fetch('/api/correlation/links', { headers: headers(identity) }),
        fetch(`/api/correlation/suggest${focusId ? `?focus=${encodeURIComponent(focusId)}` : ''}`, { headers: headers(identity) }),
      ]);
      if (!l.ok || !s.ok) throw new Error('Failed to load correlations');
      const links = await l.json();
      setArtifacts(links.artifacts);
      setLinks(links.links);
      setSets(links.sets);
      setAudit(links.audit);
      setSuggestions((await s.json()).suggestions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load correlations');
    } finally {
      setLoading(false);
    }
  }, [identity, focusId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/correlation/links', { method: 'POST', headers: headers(identity), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed');
        return null;
      }
      await refresh();
      return data;
    },
    [identity, refresh],
  );

  return { artifacts, links, sets, audit, suggestions, loading, error, refresh, act };
}
