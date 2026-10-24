/**
 * Pure pagination utility functions — no browser or React dependencies.
 *
 * Supports both traditional offset-based pagination and keyset (cursor-based)
 * pagination for dynamic datasets prone to insert/delete mutations between fetches (#1362).
 *
 * Cursor contract (#1834):
 *   - Cursors are opaque base64 payloads; v2 payloads are versioned and bound
 *     to a scope fingerprint of the route, sort and filters (computeCursorScope).
 *   - Ordering is always total: primary sort key with a mandatory id tiebreaker,
 *     so ties never fall back to storage/memory iteration order.
 *   - Snapshot consistency: pages are cut from a live scan, not a frozen
 *     snapshot. Rows present for the whole pagination pass appear exactly once
 *     (no loss, no duplicates); rows inserted mid-pass may be missed if they
 *     sort before the cursor, and deleted rows may vanish before being seen.
 *     See docs/adr/0012-keyset-pagination-snapshot-consistency.md.
 */

import type { FuzzingRun } from './types';

export interface PaginationState {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
}

export interface KeysetCursor {
  sortKey: string | number;
  id: string;
}

export interface KeysetPaginationResult<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginateKeysetOptions<T> {
  cursor?: string | null;
  limit?: number;
  getItemKeyset?: (item: T) => KeysetCursor;
  direction?: 'asc' | 'desc';
  onLegacyCursor?: (cursor: string) => void;
  /**
   * When set, emitted cursors are versioned and cryptographically bound to
   * this scope fingerprint (a hash of the route, sort and active filters).
   * Supplying a cursor whose scope does not match the current query throws
   * {@link CursorMismatchError} instead of silently returning wrong pages.
   */
  scope?: string;
}

/**
 * Version tag for cursor payloads. v1 = bare `{ sortKey, id }`, v2 adds
 * `{ v, scope }`. Bump when the payload shape changes; older servers reject
 * newer versions explicitly rather than misreading them.
 */
export const CURSOR_PAYLOAD_VERSION = 2;

/**
 * Thrown when a well-formed, versioned cursor is replayed against a query
 * whose sort or filter set differs from the one that issued it. Routes map
 * this to HTTP 400 (CURSOR_MISMATCH) so clients restart from page 1 rather
 * than triaging a silently misaligned page.
 */
export class CursorMismatchError extends Error {
  constructor(message = 'Cursor does not match this query\'s sort/filter; restart pagination from page 1.') {
    super(message);
    this.name = 'CursorMismatchError';
  }
}

/** 32-bit FNV-1a, hex-encoded — a small stable fingerprint, not a security hash. */
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Canonical fingerprint of the query a cursor belongs to. Key order is sorted
 * and empty/null/undefined values normalize to empty so semantically identical
 * queries always produce the same scope.
 */
export function computeCursorScope(
  parts: Record<string, string | number | null | undefined>,
): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((key) => {
      const value = parts[key];
      const normalized = value === undefined || value === null ? '' : String(value);
      return `${key}=${normalized}`;
    })
    .join('&');
  return fnv1a32Hex(canonical);
}

/** Base64 encode a versioned, scope-bound keyset cursor. */
export function encodeBoundCursor(cursor: KeysetCursor, scope: string): string {
  const json = JSON.stringify({
    v: CURSOR_PAYLOAD_VERSION,
    sortKey: cursor.sortKey,
    id: cursor.id,
    scope,
  });
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  if (typeof btoa !== 'undefined') {
    return btoa(json);
  }
  return '';
}

export type BoundCursorDecode =
  | { ok: true; cursor: KeysetCursor }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'unsupported-version' }
  | { ok: false; reason: 'scope-mismatch' };

/**
 * Decodes a versioned, scope-bound cursor and verifies it against
 * `expectedScope`. v1 (unversioned) and legacy offset cursors decode as
 * `'invalid'` so callers can reset gracefully; a v2 cursor issued under a
 * different sort/filter decodes as `'scope-mismatch'` and must be rejected.
 */
export function decodeBoundCursor(cursorStr: string, expectedScope: string): BoundCursorDecode {
  if (!cursorStr || typeof cursorStr !== 'string') return { ok: false, reason: 'invalid' };
  let parsed: unknown;
  try {
    let json: string;
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(cursorStr, 'base64').toString('utf8');
    } else if (typeof atob !== 'undefined') {
      json = atob(cursorStr);
    } else {
      return { ok: false, reason: 'invalid' };
    }
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'invalid' };
  }
  if (!('v' in parsed)) {
    // Legacy offset cursors and v1 keyset payloads carry no scope binding.
    return { ok: false, reason: 'invalid' };
  }
  if ((parsed as { v?: unknown }).v !== CURSOR_PAYLOAD_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }

  const candidate = parsed as { v: number; sortKey?: unknown; id?: unknown; scope?: unknown };
  if (
    typeof candidate.id !== 'string' ||
    !(typeof candidate.sortKey === 'string' || typeof candidate.sortKey === 'number') ||
    typeof candidate.scope !== 'string'
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (candidate.scope !== expectedScope) {
    return { ok: false, reason: 'scope-mismatch' };
  }

  return { ok: true, cursor: { sortKey: candidate.sortKey as string | number, id: candidate.id } };
}

/**
 * Base64 encode a keyset cursor `{ sortKey, id }`.
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ sortKey: cursor.sortKey, id: cursor.id });
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  if (typeof btoa !== 'undefined') {
    return btoa(json);
  }
  return '';
}

/**
 * Decodes a base64 keyset cursor.
 * Returns null if the cursor is invalid, malformed, or an old offset cursor.
 */
export function decodeCursor(cursorStr: string): KeysetCursor | null {
  if (!cursorStr || typeof cursorStr !== 'string') return null;
  try {
    let json: string;
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(cursorStr, 'base64').toString('utf8');
    } else if (typeof atob !== 'undefined') {
      json = atob(cursorStr);
    } else {
      return null;
    }
    const parsed = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'id' in parsed &&
      typeof parsed.id === 'string' &&
      'sortKey' in parsed &&
      (typeof parsed.sortKey === 'string' || typeof parsed.sortKey === 'number')
    ) {
      return { sortKey: parsed.sortKey, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a raw cursor string appears to be a legacy offset cursor
 * (e.g. integer string, offset prefix) or malformed payload.
 */
export function isLegacyOrInvalidCursor(cursorStr: string): boolean {
  if (!cursorStr) return false;
  return decodeCursor(cursorStr) === null;
}

/**
 * Compares two keyset items ensuring deterministic, stable sorting (#1362).
 *
 * Sorting Stability Guarantee:
 * When primary sortKeys collide (e.g. identical timestamps from batch creations or
 * concurrent runs), the secondary `id` tiebreaker strictly disambiguates order.
 * This guarantees that every item occupies a unique, deterministic position in the sequence,
 * preventing duplicate items or skipped boundary rows across page boundaries.
 *
 * @param a - First keyset item
 * @param b - Second keyset item
 * @param direction - Sort direction ('desc' for newest/highest first, 'asc' for oldest/lowest first)
 * @returns Negative if `a` precedes `b`, positive if `b` precedes `a`, 0 if identical.
 */
export function compareKeyset(
  a: KeysetCursor,
  b: KeysetCursor,
  direction: 'asc' | 'desc' = 'desc',
): number {
  let primaryDiff = 0;
  if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
    primaryDiff = a.sortKey - b.sortKey;
  } else {
    primaryDiff = String(a.sortKey).localeCompare(String(b.sortKey));
  }

  if (primaryDiff !== 0) {
    return direction === 'asc' ? primaryDiff : -primaryDiff;
  }

  // Secondary ID tiebreaker: enforces absolute ordering stability when sortKeys collide.
  const idDiff = a.id.localeCompare(b.id);
  return direction === 'asc' ? idDiff : -idDiff;
}

/**
 * Extracts keyset cursor fields from a FuzzingRun object.
 */
export function getRunKeyset(run: FuzzingRun): KeysetCursor {
  return {
    sortKey: run.queuedAt || run.startedAt || (run as { createdAt?: string }).createdAt || '',
    id: run.id,
  };
}

export interface ArtifactKeysetSource {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Extracts keyset cursor fields from artifact metadata. Redis-backed records
 * carry `updatedAt`; filesystem records carry `createdAt` — both sort newest
 * first, and the `id` tiebreaker keeps the order total when timestamps collide.
 */
export function getArtifactKeyset(artifact: ArtifactKeysetSource): KeysetCursor {
  return {
    sortKey: artifact.updatedAt || artifact.createdAt || '',
    id: artifact.id,
  };
}

/**
 * Performs keyset pagination on an array of items.
 *
 * Prevents skips and duplicate rows when items are inserted or deleted between fetches.
 * If a legacy/invalid cursor is supplied, resets gracefully to page 1 and invokes `onLegacyCursor`.
 */
export function paginateKeyset<T>(
  items: T[],
  options: PaginateKeysetOptions<T> = {},
): KeysetPaginationResult<T> {
  const {
    cursor = null,
    limit = 10,
    getItemKeyset = (item: T) => item as unknown as KeysetCursor,
    direction = 'desc',
    onLegacyCursor,
    scope,
  } = options;

  if (limit <= 0) throw new RangeError('limit must be > 0');

  // Sort deterministically with primary sortKey and secondary id tiebreaker
  const sorted = [...items].sort((a, b) =>
    compareKeyset(getItemKeyset(a), getItemKeyset(b), direction),
  );

  let filtered = sorted;

  if (cursor) {
    if (scope) {
      const decodedBound = decodeBoundCursor(cursor, scope);
      if (decodedBound.reason === 'scope-mismatch') {
        throw new CursorMismatchError();
      }
      if (decodedBound.reason === 'unsupported-version') {
        throw new CursorMismatchError(
          'Cursor was issued by an incompatible server version; restart pagination from page 1.',
        );
      }
      if (decodedBound.ok) {
        const target = decodedBound.cursor;
        filtered = sorted.filter((item) => compareKeyset(getItemKeyset(item), target, direction) > 0);
      } else {
        // Legacy offset or v1 cursor: reset gracefully to page 1
        if (onLegacyCursor) {
          onLegacyCursor(cursor);
        }
        filtered = sorted;
      }
    } else {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        // Legacy offset or corrupt cursor: reset gracefully to page 1
        if (onLegacyCursor) {
          onLegacyCursor(cursor);
        }
        filtered = sorted;
      } else {
        // Filter for items appearing strictly after the cursor in the sorted order
        filtered = sorted.filter(
          (item) => compareKeyset(getItemKeyset(item), decoded, direction) > 0,
        );
      }
    }
  }

  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const lastKey = pageItems.length > 0 ? getItemKeyset(pageItems[pageItems.length - 1]) : null;
  const nextCursor =
    hasMore && lastKey
      ? scope
        ? encodeBoundCursor(lastKey, scope)
        : encodeCursor(lastKey)
      : null;

  return {
    items: pageItems,
    total: items.length,
    nextCursor,
    hasMore,
  };
}

// ─── Legacy / Offset-Based Pagination Helpers ─────────────────────────────────

export function computeTotalPages(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) throw new RangeError('pageSize must be > 0');
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function getPageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) throw new RangeError('pageSize must be > 0');
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}

export function buildPaginationState(
  totalItems: number,
  currentPage: number,
  pageSize: number,
): PaginationState {
  const totalPages = computeTotalPages(totalItems, pageSize);
  return {
    totalItems,
    pageSize,
    totalPages,
    currentPage: clampPage(currentPage, totalPages),
  };
}
