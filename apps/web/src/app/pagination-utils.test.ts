import {
  computeTotalPages,
  getPageSlice,
  clampPage,
  buildPaginationState,
  encodeCursor,
  decodeCursor,
  isLegacyOrInvalidCursor,
  compareKeyset,
  paginateKeyset,
  getRunKeyset,
  type KeysetCursor,
} from './pagination-utils';
import type { FuzzingRun } from './types';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, validator?: (error: unknown) => boolean): void {
  try {
    fn();
    throw new Error('Expected function to throw but it did not');
  } catch (error) {
    if (validator && !validator(error)) {
      throw new Error(`Error did not match validator: ${error}`);
    }
  }
}

// computeTotalPages: handles zero items
{
  const result = computeTotalPages(0, 10);
  assertEqual(result, 1);
}

// computeTotalPages: handles single page of items
{
  const result = computeTotalPages(5, 10);
  assertEqual(result, 1);
}

// computeTotalPages: handles exactly one page
{
  const result = computeTotalPages(10, 10);
  assertEqual(result, 1);
}

// computeTotalPages: handles multiple pages
{
  const result = computeTotalPages(25, 10);
  assertEqual(result, 3);
}

// computeTotalPages: handles large numbers
{
  const result = computeTotalPages(1000, 20);
  assertEqual(result, 50);
}

// computeTotalPages: rounds up partial pages
{
  const result = computeTotalPages(21, 10);
  assertEqual(result, 3);
}

// computeTotalPages: throws RangeError for zero pageSize
{
  assertThrows(
    () => computeTotalPages(10, 0),
    (error: unknown) => error instanceof RangeError && (error as RangeError).message.includes('pageSize must be > 0'),
  );
}

// computeTotalPages: throws RangeError for negative pageSize
{
  assertThrows(
    () => computeTotalPages(10, -5),
    (error: unknown) => error instanceof RangeError,
  );
}

// getPageSlice: returns first page correctly
{
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result = getPageSlice(items, 1, 3);
  assertDeepEqual(result, [1, 2, 3]);
}

// getPageSlice: returns middle page correctly
{
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result = getPageSlice(items, 2, 3);
  assertDeepEqual(result, [4, 5, 6]);
}

// getPageSlice: returns last page correctly
{
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result = getPageSlice(items, 4, 3);
  assertDeepEqual(result, [10]);
}

// getPageSlice: handles empty array
{
  const items: number[] = [];
  const result = getPageSlice(items, 1, 10);
  assertDeepEqual(result, []);
}

// getPageSlice: returns empty array for out-of-bounds page
{
  const items = [1, 2, 3];
  const result = getPageSlice(items, 10, 3);
  assertDeepEqual(result, []);
}

// getPageSlice: handles page size larger than array
{
  const items = [1, 2, 3];
  const result = getPageSlice(items, 1, 10);
  assertDeepEqual(result, [1, 2, 3]);
}

// getPageSlice: throws RangeError for zero pageSize
{
  const items = [1, 2, 3];
  assertThrows(
    () => getPageSlice(items, 1, 0),
    (error: unknown) => error instanceof RangeError && (error as RangeError).message.includes('pageSize must be > 0'),
  );
}

// getPageSlice: throws RangeError for negative pageSize
{
  const items = [1, 2, 3];
  assertThrows(
    () => getPageSlice(items, 1, -5),
    (error: unknown) => error instanceof RangeError,
  );
}

// getPageSlice: works with different data types
{
  const items = ['a', 'b', 'c', 'd', 'e'];
  const result = getPageSlice(items, 2, 2);
  assertDeepEqual(result, ['c', 'd']);
}

// clampPage: returns page when within bounds
{
  const result = clampPage(5, 10);
  assertEqual(result, 5);
}

// clampPage: clamps page below 1 to 1
{
  const result = clampPage(0, 10);
  assertEqual(result, 1);
}

// clampPage: clamps negative page to 1
{
  const result = clampPage(-5, 10);
  assertEqual(result, 1);
}

// clampPage: clamps page above totalPages to totalPages
{
  const result = clampPage(15, 10);
  assertEqual(result, 10);
}

// clampPage: handles edge case of page 1 with 1 total page
{
  const result = clampPage(1, 1);
  assertEqual(result, 1);
}

// clampPage: handles extremely large page number
{
  const result = clampPage(999999, 10);
  assertEqual(result, 10);
}

// buildPaginationState: builds correct state for first page
{
  const result = buildPaginationState(100, 1, 10);
  assertEqual(result.totalItems, 100);
  assertEqual(result.pageSize, 10);
  assertEqual(result.totalPages, 10);
  assertEqual(result.currentPage, 1);
}

// buildPaginationState: builds correct state for middle page
{
  const result = buildPaginationState(100, 5, 10);
  assertEqual(result.currentPage, 5);
  assertEqual(result.totalPages, 10);
}

// buildPaginationState: clamps out-of-range page to valid range
{
  const result = buildPaginationState(100, 50, 10);
  assertEqual(result.currentPage, 10);
  assertEqual(result.totalPages, 10);
}

// buildPaginationState: clamps negative page to 1
{
  const result = buildPaginationState(100, -1, 10);
  assertEqual(result.currentPage, 1);
}

// buildPaginationState: handles zero items
{
  const result = buildPaginationState(0, 1, 10);
  assertEqual(result.totalItems, 0);
  assertEqual(result.totalPages, 1);
  assertEqual(result.currentPage, 1);
}

// buildPaginationState: handles partial last page
{
  const result = buildPaginationState(25, 3, 10);
  assertEqual(result.totalPages, 3);
  assertEqual(result.currentPage, 3);
}

// buildPaginationState: returns all required fields with correct types
{
  const result = buildPaginationState(50, 2, 10);
  if (typeof result.totalItems !== 'number') throw new Error('totalItems should be number');
  if (typeof result.pageSize !== 'number') throw new Error('pageSize should be number');
  if (typeof result.totalPages !== 'number') throw new Error('totalPages should be number');
  if (typeof result.currentPage !== 'number') throw new Error('currentPage should be number');
  if (Object.keys(result).length !== 4) throw new Error('Should have exactly 4 fields');
}

// Integration: full pagination scenario
{
  const items = Array.from({ length: 47 }, (_, i) => i + 1);
  const pageSize = 10;
  const page = 3;

  const state = buildPaginationState(items.length, page, pageSize);
  const slice = getPageSlice(items, page, pageSize);

  assertEqual(state.totalPages, 5);
  assertEqual(state.currentPage, 3);
  assertDeepEqual(slice, [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
}

// ─── Keyset Cursor Encoding / Decoding ────────────────────────────────────────

// encodeCursor / decodeCursor: round-trips a valid cursor
{
  const original: KeysetCursor = { sortKey: '2026-03-01T08:00:00.000Z', id: 'run-1000' };
  const encoded = encodeCursor(original);
  const decoded = decodeCursor(encoded);
  assertDeepEqual(decoded, original, 'decodeCursor should round-trip a keyset cursor');
}

// encodeCursor / decodeCursor: round-trips a numeric sortKey
{
  const original: KeysetCursor = { sortKey: 12345, id: 'run-abc' };
  const encoded = encodeCursor(original);
  const decoded = decodeCursor(encoded);
  assertDeepEqual(decoded, original, 'decodeCursor should round-trip a numeric sortKey');
}

// decodeCursor: returns null for empty string
{
  const result = decodeCursor('');
  assertEqual(result, null, 'empty string should return null');
}

// decodeCursor: returns null for a legacy offset integer cursor
{
  const result = decodeCursor('10');
  assertEqual(result, null, 'plain integer offset cursor should return null');
}

// decodeCursor: returns null for random garbage
{
  const result = decodeCursor('not-valid-base64!!!');
  assertEqual(result, null, 'garbage cursor should return null');
}

// decodeCursor: returns null for a valid base64 but non-cursor JSON payload
{
  const fakeBase64 = typeof Buffer !== 'undefined'
    ? Buffer.from('{"foo":"bar"}', 'utf8').toString('base64')
    : btoa('{"foo":"bar"}');
  const result = decodeCursor(fakeBase64);
  assertEqual(result, null, 'base64 JSON without cursor fields should return null');
}

// isLegacyOrInvalidCursor: returns false for empty string (no cursor)
{
  const result = isLegacyOrInvalidCursor('');
  assertEqual(result, false, 'empty string is not a legacy cursor');
}

// isLegacyOrInvalidCursor: detects offset integer cursors
{
  const result = isLegacyOrInvalidCursor('20');
  assertEqual(result, true, 'plain integer "20" should be detected as legacy');
}

// isLegacyOrInvalidCursor: returns false for valid keyset cursor
{
  const validCursor = encodeCursor({ sortKey: '2026-01-01', id: 'run-1' });
  const result = isLegacyOrInvalidCursor(validCursor);
  assertEqual(result, false, 'valid encoded cursor should not be flagged as legacy');
}

// ─── compareKeyset: sorting stability ─────────────────────────────────────────

// compareKeyset: desc puts newer sortKey first
{
  const a: KeysetCursor = { sortKey: '2026-03-01T09:00:00Z', id: 'run-b' };
  const b: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-a' };
  const result = compareKeyset(a, b, 'desc');
  if (result >= 0) throw new Error(`Expected a to sort before b in desc, got ${result}`);
}

// compareKeyset: asc puts older sortKey first
{
  const a: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-a' };
  const b: KeysetCursor = { sortKey: '2026-03-01T09:00:00Z', id: 'run-b' };
  const result = compareKeyset(a, b, 'asc');
  if (result >= 0) throw new Error(`Expected a to sort before b in asc, got ${result}`);
}

// compareKeyset: id tiebreaker enforced when sortKeys collide (desc)
{
  const a: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-z' };
  const b: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-a' };
  const result = compareKeyset(a, b, 'desc');
  // 'run-z' > 'run-a' so in desc a sorts BEFORE b → result should be negative
  if (result >= 0) throw new Error(`id tiebreaker failed in desc mode: got ${result}`);
}

// compareKeyset: id tiebreaker enforced when sortKeys collide (asc)
{
  const a: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-a' };
  const b: KeysetCursor = { sortKey: '2026-03-01T08:00:00Z', id: 'run-z' };
  const result = compareKeyset(a, b, 'asc');
  if (result >= 0) throw new Error(`id tiebreaker failed in asc mode: got ${result}`);
}

// ─── paginateKeyset helper ─────────────────────────────────────────────────────

function makeRun(overrides: Partial<FuzzingRun>): FuzzingRun {
  return {
    id: 'run-0',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1000,
    seedCount: 100,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    queuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FuzzingRun;
}

function buildRuns(n: number): FuzzingRun[] {
  return Array.from({ length: n }, (_, i) => makeRun({
    id: `run-${1000 + i}`,
    queuedAt: new Date(Date.UTC(2026, 2, 1, 8, 0, 0) + i * 60_000).toISOString(),
  }));
}

// paginateKeyset: first page (no cursor) returns limit items and a next cursor
{
  const runs = buildRuns(15);
  const result = paginateKeyset(runs, {
    limit: 10,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });
  assertEqual(result.items.length, 10, 'first page should have 10 items');
  assertEqual(result.hasMore, true, 'should have more pages');
  assertEqual(result.total, 15, 'total should be 15');
  if (!result.nextCursor) throw new Error('nextCursor should be set');
}

// paginateKeyset: last page has fewer items and no next cursor
{
  const runs = buildRuns(12);
  const firstPage = paginateKeyset(runs, {
    limit: 10,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });
  const secondPage = paginateKeyset(runs, {
    cursor: firstPage.nextCursor,
    limit: 10,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });
  assertEqual(secondPage.items.length, 2, 'last page should have 2 items');
  assertEqual(secondPage.hasMore, false, 'should not have more pages');
  assertEqual(secondPage.nextCursor, null, 'nextCursor should be null on last page');
}

// paginateKeyset: delete-between-fetches — no duplicate or skip
// Simulates: fetch page 1, delete an item before page 2, page 2 should have no dups
{
  const runs = buildRuns(15);
  const firstPage = paginateKeyset(runs, {
    limit: 5,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });

  const firstPageIds = firstPage.items.map(r => r.id);

  // Simulate deletion of one item that was in position 3 of the first page
  const deleted = firstPageIds[2];
  const runsAfterDeletion = runs.filter(r => r.id !== deleted);

  const secondPage = paginateKeyset(runsAfterDeletion, {
    cursor: firstPage.nextCursor,
    limit: 5,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });

  const secondPageIds = secondPage.items.map(r => r.id);

  // No overlap between pages
  for (const id of firstPageIds) {
    if (secondPageIds.includes(id)) {
      throw new Error(`Duplicate item ${id} found after delete-between-fetches`);
    }
  }
  // The deleted item must not appear in page 2
  if (secondPageIds.includes(deleted)) {
    throw new Error(`Deleted item ${deleted} appeared in page 2`);
  }
}

// paginateKeyset: insert-between-fetches — boundary row is not duplicated
{
  const runs = buildRuns(14);
  const firstPage = paginateKeyset(runs, {
    limit: 5,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });

  const firstPageIds = firstPage.items.map(r => r.id);

  // Insert a new run in the middle of the list (timestamp puts it between page 1 and 2)
  // Use a timestamp that falls BEFORE the cursor (i.e. older than last item on page 1)
  const lastOnPage1 = firstPage.items[firstPage.items.length - 1];
  const boundaryTs = new Date(
    new Date(lastOnPage1.queuedAt!).getTime() - 30_000
  ).toISOString();
  const newRun = makeRun({ id: 'run-inserted', queuedAt: boundaryTs });
  const runsAfterInsert = [...runs, newRun];

  const secondPage = paginateKeyset(runsAfterInsert, {
    cursor: firstPage.nextCursor,
    limit: 5,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
  });

  const secondPageIds = secondPage.items.map(r => r.id);

  // No item from page 1 should appear in page 2
  for (const id of firstPageIds) {
    if (secondPageIds.includes(id)) {
      throw new Error(`Boundary duplicate: ${id} appeared on both pages after insert`);
    }
  }
}

// paginateKeyset: legacy cursor resets to page 1 and calls onLegacyCursor
{
  const runs = buildRuns(15);
  let legacyCursorSeen: string | null = null;

  const result = paginateKeyset(runs, {
    cursor: '20',          // legacy offset cursor — not a valid base64 keyset
    limit: 5,
    getItemKeyset: getRunKeyset,
    direction: 'desc',
    onLegacyCursor: (c) => { legacyCursorSeen = c; },
  });

  // Should have reset to page 1 (first 5 items)
  assertEqual(result.items.length, 5, 'legacy cursor should reset to first page');
  assertEqual(legacyCursorSeen, '20', 'onLegacyCursor should have been called with the offending cursor');
}

// paginateKeyset: throws RangeError for limit <= 0
{
  assertThrows(
    () => paginateKeyset([], { limit: 0, getItemKeyset: (x) => x as KeysetCursor }),
    (err) => err instanceof RangeError,
  );
}

// getRunKeyset: extracts queuedAt as sortKey and run id
{
  const run = makeRun({ id: 'run-999', queuedAt: '2026-06-01T12:00:00Z' });
  const ks = getRunKeyset(run);
  assertEqual(ks.id, 'run-999');
  assertEqual(ks.sortKey, '2026-06-01T12:00:00Z');
}

// getRunKeyset: falls back to startedAt when queuedAt is absent
{
  const run = makeRun({ id: 'run-888', queuedAt: undefined, startedAt: '2026-05-15T08:00:00Z' });
  const ks = getRunKeyset(run);
  assertEqual(ks.sortKey, '2026-05-15T08:00:00Z');
}

console.log('pagination-utils.test.ts: all assertions passed');
