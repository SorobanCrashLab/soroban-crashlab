/**
 * Saved queries and query history (#2339).
 *
 * Persisted through `safeStorage` as canonical JSON, so a stored entry is
 * re-validated by the same parser as a shared link when it is loaded — a
 * tampered or outdated entry is dropped, not executed.
 */

import { safeStorage } from '@/lib/local-storage';
import type { Literal } from './schema';
import type { VisualQuery } from './model';
import { parseQueryJson, queryFingerprint, serializeQuery } from './serialize';

export const SAVED_QUERIES_KEY = 'crashlab.queryBuilder.saved';
export const QUERY_HISTORY_KEY = 'crashlab.queryBuilder.history';
export const MAX_SAVED = 50;
export const MAX_HISTORY = 20;

export interface SavedQuery {
  id: string;
  name: string;
  description: string;
  /** `private` stays on this device; `team` is offered in share links. */
  visibility: 'private' | 'team';
  query: VisualQuery;
  paramValues: Record<string, Literal | null>;
  savedAt: string;
}

export interface HistoryEntry {
  fingerprint: string;
  query: VisualQuery;
  ranAt: string;
  tookMs: number;
  rows: number;
  truncated: boolean;
}

interface StoredSaved extends Omit<SavedQuery, 'query'> {
  query: string;
}

interface StoredHistory extends Omit<HistoryEntry, 'query'> {
  query: string;
}

function readArray(key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(safeStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSavedQueries(): SavedQuery[] {
  return readArray(SAVED_QUERIES_KEY).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const stored = item as Partial<StoredSaved>;
    if (typeof stored.id !== 'string' || typeof stored.name !== 'string' || typeof stored.query !== 'string') return [];
    const parsed = parseQueryJson(stored.query);
    if (!parsed.ok) return [];
    return [
      {
        id: stored.id,
        name: stored.name.slice(0, 80),
        description: typeof stored.description === 'string' ? stored.description.slice(0, 300) : '',
        visibility: stored.visibility === 'team' ? 'team' : 'private',
        query: parsed.query,
        paramValues: stored.paramValues && typeof stored.paramValues === 'object' ? stored.paramValues : {},
        savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : new Date(0).toISOString(),
      },
    ];
  });
}

export function persistSavedQueries(queries: readonly SavedQuery[]): void {
  const stored: StoredSaved[] = queries.slice(0, MAX_SAVED).map((entry) => ({
    ...entry,
    query: serializeQuery(entry.query),
  }));
  safeStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(stored));
}

/** Insert or replace by name (case-insensitive), newest first. */
export function upsertSavedQuery(
  existing: readonly SavedQuery[],
  input: Omit<SavedQuery, 'id' | 'savedAt'>,
  now: Date = new Date(),
): SavedQuery[] {
  const name = input.name.trim().slice(0, 80) || 'Untitled query';
  const match = existing.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  const entry: SavedQuery = {
    ...input,
    name,
    id: match?.id ?? `saved-${queryFingerprint(input.query)}-${now.getTime().toString(36)}`,
    savedAt: now.toISOString(),
  };
  return [entry, ...existing.filter((candidate) => candidate.id !== entry.id)].slice(0, MAX_SAVED);
}

export function loadHistory(): HistoryEntry[] {
  return readArray(QUERY_HISTORY_KEY).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const stored = item as Partial<StoredHistory>;
    if (typeof stored.query !== 'string') return [];
    const parsed = parseQueryJson(stored.query);
    if (!parsed.ok) return [];
    return [
      {
        fingerprint: queryFingerprint(parsed.query),
        query: parsed.query,
        ranAt: typeof stored.ranAt === 'string' ? stored.ranAt : new Date(0).toISOString(),
        tookMs: typeof stored.tookMs === 'number' ? stored.tookMs : 0,
        rows: typeof stored.rows === 'number' ? stored.rows : 0,
        truncated: stored.truncated === true,
      },
    ];
  });
}

/** Newest first; re-running a query moves it to the top instead of duplicating. */
export function pushHistory(existing: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...existing.filter((candidate) => candidate.fingerprint !== entry.fingerprint)].slice(0, MAX_HISTORY);
}

export function persistHistory(entries: readonly HistoryEntry[]): void {
  const stored: StoredHistory[] = entries.slice(0, MAX_HISTORY).map((entry) => ({
    ...entry,
    query: serializeQuery(entry.query),
  }));
  safeStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(stored));
}
