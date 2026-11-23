/**
 * Client transport, persistence and export helpers for the log workbench (#075).
 * All fetches accept an AbortSignal so superseded queries never win a race.
 */

import { csvEscape } from '@/app/csv-escape';
import { getJsonStorageItem, setJsonStorageItem } from '@/lib/local-storage';
import { canonicalStateJson, queryFingerprint } from '@/features/logs/query-engine/dsl/serializer';
import type {
  LogEvent,
  LogSearchResponse,
  LogTailResponse,
  QueryState,
  SavedQuery,
} from './types';
import type { LogViewerRole } from './redaction';

export interface LogIdentity {
  user: string;
  role: LogViewerRole;
}

export const DEFAULT_LOG_IDENTITY: LogIdentity = { user: 'log-viewer', role: 'viewer' };

function identityHeaders(identity: LogIdentity): HeadersInit {
  return {
    Accept: 'application/json',
    'x-crashlab-user': identity.user,
    'x-crashlab-role': identity.role,
  };
}

export interface SearchLogsParams {
  query: string;
  from: number;
  to: number;
  facets: Record<string, string[]>;
  sort: 'asc' | 'desc';
  cursor?: string | null;
  limit?: number;
  sample?: number;
  histogram?: [number, number] | null;
}

function searchParams(params: SearchLogsParams): URLSearchParams {
  const search = new URLSearchParams({
    q: params.query,
    from: String(params.from),
    to: String(params.to),
    sort: params.sort,
    limit: String(params.limit ?? 200),
    sample: String(params.sample ?? 1),
  });
  if (params.cursor) search.set('cursor', params.cursor);
  for (const [field, values] of Object.entries(params.facets)) {
    for (const value of values) search.append('facet', `${field}:${value}`);
  }
  if (params.histogram) {
    search.set('histFrom', String(params.histogram[0]));
    search.set('histTo', String(params.histogram[1]));
  }
  return search;
}

export async function searchLogs(
  params: SearchLogsParams,
  identity: LogIdentity = DEFAULT_LOG_IDENTITY,
  signal?: AbortSignal,
): Promise<LogSearchResponse> {
  const response = await fetch(`/api/logs/search?${searchParams(params).toString()}`, {
    signal,
    cache: 'no-store',
    headers: identityHeaders(identity),
  });
  const payload = await response.json() as LogSearchResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Log search failed (${response.status}).`);
  }
  return payload;
}

export interface TailLogsParams {
  cursor: string | number;
  query?: string;
  limit?: number;
  sample?: number;
}

export async function tailLogs(
  params: TailLogsParams,
  identity: LogIdentity = DEFAULT_LOG_IDENTITY,
  signal?: AbortSignal,
): Promise<LogTailResponse> {
  const search = new URLSearchParams({
    cursor: String(params.cursor),
    limit: String(params.limit ?? 50),
    sample: String(params.sample ?? 1),
  });
  if (params.query) search.set('q', params.query);
  const response = await fetch(`/api/logs/tail?${search.toString()}`, {
    signal,
    cache: 'no-store',
    headers: identityHeaders(identity),
  });
  const payload = await response.json() as LogTailResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Log tail failed (${response.status}).`);
  return payload;
}

// ---------------------------------------------------------------------------
// Saved queries and recent history (local-first, deterministic)
// ---------------------------------------------------------------------------
export const SAVED_QUERIES_KEY = 'crashlab:log-queries:v1';
export const RECENT_QUERIES_KEY = 'crashlab:log-query-history:v1';

function readStorage<T>(key: string): T[] {
  const parsed = getJsonStorageItem<unknown>(key);
  return Array.isArray(parsed) ? parsed as T[] : [];
}

function writeStorage<T>(key: string, value: T[]): void {
  // safeStorage falls back to memory when browser storage is unavailable.
  setJsonStorageItem(key, value);
}

export function loadSavedQueries(): SavedQuery[] {
  return readStorage<SavedQuery>(SAVED_QUERIES_KEY);
}

export function saveQuery(name: string, state: QueryState, now = Date.now()): SavedQuery[] {
  const queries = loadSavedQueries();
  const trimmed = name.trim();
  if (!trimmed) return queries;
  const fingerprint = queryFingerprint(state);
  const existing = queries.find((query) => query.name === trimmed || queryFingerprint(query.state) === fingerprint);
  const next: SavedQuery = {
    id: existing?.id ?? `q-${fingerprint}-${now.toString(36)}`,
    name: trimmed,
    state,
    createdAt: existing?.createdAt ?? now,
  };
  const updated = existing
    ? queries.map((query) => (query.id === existing.id ? next : query))
    : [next, ...queries];
  writeStorage(SAVED_QUERIES_KEY, updated);
  return updated;
}

export function deleteSavedQuery(id: string): SavedQuery[] {
  const updated = loadSavedQueries().filter((query) => query.id !== id);
  writeStorage(SAVED_QUERIES_KEY, updated);
  return updated;
}

export function loadRecentQueries(): QueryState[] {
  return readStorage<QueryState>(RECENT_QUERIES_KEY).slice(0, 12);
}

export function pushRecentQuery(state: QueryState): QueryState[] {
  const fingerprint = queryFingerprint(state);
  const updated = [state, ...loadRecentQueries().filter((entry) => queryFingerprint(entry) !== fingerprint)].slice(0, 12);
  writeStorage(RECENT_QUERIES_KEY, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export type LogExportFormat = 'json' | 'ndjson' | 'csv';

const EXPORT_COLUMNS = [
  'id', 'timestamp', 'level', 'source', 'contract', 'run_id', 'campaign_id',
  'trace_id', 'span_id', 'error_code', 'incident_id', 'artifact_id', 'message',
] as const;

function cellFor(event: LogEvent, column: (typeof EXPORT_COLUMNS)[number]): string | number {
  switch (column) {
    case 'timestamp': return new Date(event.timestamp).toISOString();
    case 'message': return event.message;
    default: return event[column] ?? '';
  }
}

/** Deterministic export with a metadata preamble embedded in JSON/NDJSON. */
export function serializeLogExport(
  events: LogEvent[],
  format: LogExportFormat,
  state: QueryState,
  exportedAt = '2026-01-01T00:00:00.000Z',
): string {
  const metadata = {
    exportedAt,
    count: events.length,
    query: canonicalStateJson(state),
    redactedFields: [...new Set(events.flatMap((event) => event.redacted ?? []))],
  };
  if (format === 'json') {
    return JSON.stringify({ metadata, events }, null, 2);
  }
  if (format === 'ndjson') {
    return [
      JSON.stringify({ type: 'metadata', ...metadata }),
      ...events.map((event) => JSON.stringify(event)),
    ].join('\n');
  }
  const header = [...EXPORT_COLUMNS, 'attributes', 'redacted'];
  const rows = events.map((event) => [
    ...EXPORT_COLUMNS.map((column) => cellFor(event, column)),
    JSON.stringify(event.attributes),
    (event.redacted ?? []).join('|'),
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}

export function downloadLogExport(
  events: LogEvent[],
  format: LogExportFormat,
  state: QueryState,
): void {
  const content = serializeLogExport(events, format, state, new Date().toISOString());
  const mime = format === 'csv' ? 'text/csv' : format === 'ndjson' ? 'application/x-ndjson' : 'application/json';
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `crashlab-logs-${Date.now()}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
