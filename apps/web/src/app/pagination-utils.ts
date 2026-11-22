/**
 * Pure pagination utility functions — no browser or React dependencies.
 *
 * Supports both traditional offset-based pagination and keyset (cursor-based)
 * pagination for dynamic datasets prone to insert/delete mutations between fetches (#1362).
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
  } = options;

  if (limit <= 0) throw new RangeError('limit must be > 0');

  // Sort deterministically with primary sortKey and secondary id tiebreaker
  const sorted = [...items].sort((a, b) =>
    compareKeyset(getItemKeyset(a), getItemKeyset(b), direction),
  );

  let filtered = sorted;

  if (cursor) {
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

  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeCursor(getItemKeyset(pageItems[pageItems.length - 1]))
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
