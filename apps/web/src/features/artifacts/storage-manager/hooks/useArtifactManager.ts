'use client';

/**
 * Client data layer for the Artifact Storage & Provenance Manager (#2342).
 *
 * Every read is keyed by its inputs plus a revision counter; mutations bump
 * the revision so dependent panels refetch. Loading flags are derived from
 * "requested key ≠ loaded key", so no state is set synchronously inside an
 * effect and stale responses are discarded on unmount or input change.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IntegrityAssessment, AccessDecision, TrustLevel } from '../lib/integrity';
import type { LineageGraph } from '../lib/lineage';
import type {
  ArtifactAuditRecord,
  BackendStatus,
  DeletionRequest,
  LegalHold,
  ManagedArtifact,
  RetentionPolicy,
} from '../lib/model';
import type { ArtifactPermissions, ArtifactRole } from '../lib/permissions';
import type { RetentionSimulation } from '../lib/governance';
import type { BrowseFacets } from '../lib/query';

export interface Viewer {
  role: ArtifactRole;
  subject: string;
  permissions: ArtifactPermissions;
}

export interface BrowsePayload {
  viewer: Viewer;
  backends: BackendStatus[];
  items: Array<ManagedArtifact & { trust: TrustLevel }>;
  total: number;
  nextCursor: string | null;
  facets: BrowseFacets;
}

export interface MetadataPayload {
  viewer: Viewer;
  artifact: ManagedArtifact;
  integrity: IntegrityAssessment;
  access: AccessDecision;
  download: { href: string; method: 'proxy' | 'presigned'; expiresAt: string | null } | null;
  holds: Array<Pick<LegalHold, 'id' | 'name' | 'kind'>>;
  deletionRequests: DeletionRequest[];
  preview: { mode: string; text: string; truncated: boolean } | null;
}

export interface RetentionPayload {
  viewer: Viewer;
  policies: RetentionPolicy[];
  simulation: RetentionSimulation;
  deletions: DeletionRequest[];
  audit: ArtifactAuditRecord[];
}

export interface HoldsPayload {
  viewer: Viewer;
  holds: Array<LegalHold & { active: boolean; coveredArtifacts: number }>;
}

export interface BrowseFilters {
  backend?: string;
  type?: string;
  campaign?: string;
  run?: string;
  tag?: string;
  q?: string;
  integrity?: string;
  sensitivity?: string;
  from?: string;
  to?: string;
  minSize?: string;
  maxSize?: string;
  sort: 'createdAt' | 'sizeBytes' | 'name';
  dir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: BrowseFilters = { sort: 'createdAt', dir: 'desc' };
export const PAGE_SIZE = 25;

interface Loaded<T> {
  key: string;
  data: T | null;
  error: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string | { message?: string } };
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message ?? `Request failed (${response.status}).`);
  }
  return body.data as T;
}

/** Fetch `url` whenever `key` changes; keeps the previous data while loading. */
function useKeyedResource<T>(key: string, url: string | null) {
  const [state, setState] = useState<Loaded<T>>({ key: '', data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    request<T>(url)
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((previous) => ({ key, data: previous.data, error: error.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, url]);
  return { data: url ? state.data : null, error: url ? state.error : null, loading: Boolean(url) && state.key !== key };
}

function toSearch(filters: BrowseFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '') continue;
    if ((key === 'from' || key === 'to') && value) {
      const parsed = Date.parse(String(value));
      if (Number.isFinite(parsed)) params.set(key, new Date(parsed).toISOString());
      continue;
    }
    params.set(key, String(value));
  }
  params.set('limit', String(PAGE_SIZE));
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function useArtifactManager() {
  const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_FILTERS);
  const [cursors, setCursors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verify, setVerify] = useState(0);
  const [lineageDepth, setLineageDepth] = useState(2);
  const [selection, setSelection] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cursor = cursors[cursors.length - 1] ?? null;
  const search = toSearch(filters, cursor);
  const browse = useKeyedResource<BrowsePayload>(`${search}#${revision}`, `/api/artifacts/browse?${search}`);

  const metadataUrl = selectedId
    ? `/api/artifacts/metadata?id=${encodeURIComponent(selectedId)}&preview=1${verify > 0 ? '&verify=1' : ''}`
    : null;
  const metadata = useKeyedResource<MetadataPayload>(`${selectedId}#${revision}#${verify}`, metadataUrl);
  const lineage = useKeyedResource<{ graph: LineageGraph }>(
    `${selectedId}#${lineageDepth}#${revision}`,
    selectedId ? `/api/artifacts/lineage?id=${encodeURIComponent(selectedId)}&depth=${lineageDepth}` : null,
  );
  const retention = useKeyedResource<RetentionPayload>(`retention#${revision}`, '/api/artifacts/retention');
  const holds = useKeyedResource<HoldsPayload>(`holds#${revision}`, '/api/artifacts/holds');

  const viewer = browse.data?.viewer ?? null;

  const updateFilters = useCallback((patch: Partial<BrowseFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setCursors([]);
    setSelection([]);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setCursors([]);
    setSelection([]);
  }, []);

  const nextPage = useCallback(() => {
    const next = browse.data?.nextCursor;
    if (next) setCursors((previous) => [...previous, next]);
  }, [browse.data?.nextCursor]);

  const previousPage = useCallback(() => setCursors((previous) => previous.slice(0, -1)), []);

  const toggleSelected = useCallback((id: string) => {
    setSelection((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  }, []);

  const selectPage = useCallback((ids: string[], checked: boolean) => {
    setSelection((previous) => (checked ? [...new Set([...previous, ...ids])] : previous.filter((id) => !ids.includes(id))));
  }, []);

  const mutate = useCallback(async <T,>(url: string, body: unknown, success: string): Promise<T | null> => {
    setBusy(true);
    try {
      const data = await request<T>(url, { method: 'POST', body: JSON.stringify(body) });
      setNotice({ kind: 'success', text: success });
      setRevision((value) => value + 1);
      return data;
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const actions = useMemo(
    () => ({
      tag: (ids: string[], add: string[], remove: string[] = []) =>
        mutate<{ updated: string[]; skipped: Array<{ id: string; reason: string }> }>(
          '/api/artifacts/metadata',
          { action: 'tag', ids, add, remove },
          `Updated tags on ${ids.length} artifact(s).`,
        ),
      requestDeletion: (artifactIds: string[], reason: string, source: 'manual' | 'retention' = 'manual') =>
        mutate('/api/artifacts/retention', { action: 'request-deletion', artifactIds, reason, source }, 'Deletion requested; awaiting approval.'),
      updatePolicy: (policy: Pick<RetentionPolicy, 'artifactType' | 'maxAgeDays' | 'action' | 'keepMinimum' | 'enabled'>) =>
        mutate('/api/artifacts/retention', { action: 'update-policy', policy }, `Policy for ${policy.artifactType} saved.`),
      decide: (requestId: string, decision: 'approve' | 'reject', note = '') =>
        mutate('/api/artifacts/retention', { action: 'decide', requestId, decision, note }, `Request ${decision === 'approve' ? 'approved' : 'rejected'}.`),
      execute: (requestId: string) => mutate('/api/artifacts/retention', { action: 'execute', requestId }, 'Approved deletion executed.'),
      createHold: (input: { name: string; kind: LegalHold['kind']; reason: string; scope: LegalHold['scope']; expiresAt?: string | null }) =>
        mutate('/api/artifacts/holds', { action: 'create', ...input }, `Hold “${input.name}” placed.`),
      releaseHold: (holdId: string, justification: string) =>
        mutate('/api/artifacts/holds', { action: 'release', holdId, justification }, 'Hold released.'),
    }),
    [mutate],
  );

  return {
    filters,
    updateFilters,
    resetFilters,
    page: cursors.length + 1,
    nextPage,
    previousPage,
    browse,
    viewer,
    selectedId,
    select: setSelectedId,
    verifyNow: () => setVerify((value) => value + 1),
    metadata,
    lineage,
    lineageDepth,
    setLineageDepth,
    retention,
    holds,
    selection,
    toggleSelected,
    selectPage,
    clearSelection: () => setSelection([]),
    notice,
    dismissNotice: () => setNotice(null),
    busy,
    ...actions,
  };
}

export type ArtifactManagerState = ReturnType<typeof useArtifactManager>;
