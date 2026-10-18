/**
 * Property/fuzz tests for keyset pagination stability (#1834).
 *
 * Each property runs over a fixed set of CI seeds (mulberry32 PRNG) so
 * failures are reproducible: the same seed always regenerates the same
 * dataset and the same insert/delete interleaving between page fetches.
 *
 * Properties asserted:
 *   1. Insert-only interleavings: the union of collected page ids equals the
 *      initial id set exactly — no loss, no duplicates, even when new rows
 *      land on page boundaries or share timestamps with existing rows.
 *   2. Insert + delete interleavings: no duplicates; every initial id is
 *      either collected or was deleted mid-scroll; inserted ids may appear.
 *   3. The emitted sequence is strictly monotonic under compareKeyset — the
 *      (sortKey, id) tiebreaker makes the order total, so ties never fall
 *      back to memory order between pages.
 *   4. Cursors are bound to the query scope: a cursor issued under one
 *      sort/filter is rejected under another, and accepted under the original.
 */

import { describe, expect, it } from 'vitest';
import {
  CursorMismatchError,
  compareKeyset,
  computeCursorScope,
  decodeBoundCursor,
  encodeBoundCursor,
  getRunKeyset,
  paginateKeyset,
  type KeysetCursor,
} from './pagination-utils';
import type { FuzzingRun } from './types';

/** Deterministic PRNG — mulberry32. Same seed, same sequence, every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed CI seed list — append-only; never reuse a seed for a new property. */
const CI_SEEDS = [1, 7, 13, 42, 99, 202, 512, 777, 1337, 2026, 31415, 65537, 99991, 123456, 987654] as const;

const SCOPE = computeCursorScope({ route: 'runs', sort: 'queuedAt:desc', status: '' });
const OTHER_SCOPE = computeCursorScope({ route: 'runs', sort: 'queuedAt:desc', status: 'failed' });

interface Item {
  id: string;
  queuedAt: string;
}

function asRun(item: Item): FuzzingRun {
  return { id: item.id, queuedAt: item.queuedAt } as unknown as FuzzingRun;
}

/**
 * Generates `n` items with timestamps drawn from a small domain so that
 * sortKey collisions (batch-created runs) are frequent.
 */
function generateItems(rand: () => number, n: number, idPrefix: string, startSeq: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i += 1) {
    const slot = Math.floor(rand() * 10); // only 10 distinct timestamps → heavy ties
    items.push({
      id: `${idPrefix}${startSeq + i}`,
      queuedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, slot)).toISOString(),
    });
  }
  return items;
}

function paginateAllPages(
  getItems: () => Item[],
  limit: number,
  onBeforeNextPage?: (pageSoFar: Item[]) => void,
): { collected: Item[]; pages: Item[][] } {
  let cursor: string | null | undefined = null;
  const collected: Item[] = [];
  const pages: Item[][] = [];
  // Bound the loop well past any sane page count so a cursor bug that never
  // advances fails loudly instead of hanging CI.
  for (let guard = 0; guard < 200; guard += 1) {
    const page = paginateKeyset(getItems(), {
      cursor,
      limit,
      getItemKeyset: getRunKeyset,
      direction: 'desc',
      scope: SCOPE,
    });
    pages.push(page.items);
    collected.push(...page.items);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
    onBeforeNextPage?.(collected);
  }
  return { collected, pages };
}

describe('keyset pagination properties (fixed CI seeds)', () => {
  it('insert-only interleavings: no loss and no duplicates of the initial set', () => {
    for (const seed of CI_SEEDS) {
      const rand = mulberry32(seed);
      const initial = generateItems(rand, 15 + Math.floor(rand() * 20), `run-${seed}-`, 0);
      const limit = 1 + Math.floor(rand() * 7);
      let live = [...initial];
      let nextId = 1000;
      const insertedIds = new Set<string>();

      const { collected } = paginateAllPages(() => live, limit, () => {
        // Insert 0–3 new rows between pages, some sharing timestamps with
        // existing rows and some landing on the page boundary.
        const k = Math.floor(rand() * 4);
        const inserted = generateItems(rand, k, `run-${seed}-in-`, nextId);
        nextId += k;
        live = [...live, ...inserted];
        inserted.forEach((i) => insertedIds.add(i.id));
      });

      const collectedIds = collected.map((i) => i.id);
      const uniqueCollected = new Set(collectedIds);
      expect(uniqueCollected.size, `seed ${seed}: duplicate rows across pages`).toBe(collectedIds.length);

      const initialIds = new Set(initial.map((i) => i.id));
      const collectedSet = new Set(collectedIds);
      for (const id of initialIds) {
        expect(collectedSet.has(id), `seed ${seed}: initial row ${id} lost mid-scroll`).toBe(true);
      }
      for (const id of collectedSet) {
        expect(
          initialIds.has(id) || insertedIds.has(id),
          `seed ${seed}: phantom row ${id} neither initial nor inserted`,
        ).toBe(true);
      }
    }
  });

  it('insert + delete interleavings: no duplicates; losses are only deleted rows', () => {
    for (const seed of CI_SEEDS) {
      const rand = mulberry32(seed ^ 0x5eed);
      const initial = generateItems(rand, 15 + Math.floor(rand() * 20), `run-${seed}-`, 0);
      const limit = 1 + Math.floor(rand() * 7);
      let live = [...initial];
      let nextId = 5000;
      const deletedIds = new Set<string>();
      const insertedIds = new Set<string>();

      const { collected } = paginateAllPages(() => live, limit, (seen) => {
        const k = Math.floor(rand() * 3);
        const inserted = generateItems(rand, k, `run-${seed}-in-`, nextId);
        nextId += k;
        live = [...live, ...inserted];
        inserted.forEach((i) => insertedIds.add(i.id));

        // Delete a row that has not been seen yet, when one exists.
        const seenIds = new Set(seen.map((i) => i.id));
        const candidates = live.filter((i) => !seenIds.has(i.id) && !deletedIds.has(i.id));
        if (candidates.length > 0 && rand() < 0.5) {
          const victim = candidates[Math.floor(rand() * candidates.length)];
          live = live.filter((i) => i.id !== victim.id);
          deletedIds.add(victim.id);
        }
      });

      const collectedIds = collected.map((i) => i.id);
      expect(new Set(collectedIds).size, `seed ${seed}: duplicate rows across pages`).toBe(collectedIds.length);

      const collectedSet = new Set(collectedIds);
      const initialIds = new Set(initial.map((i) => i.id));
      for (const id of initialIds) {
        if (collectedSet.has(id)) continue;
        expect(deletedIds.has(id), `seed ${seed}: row ${id} lost without being deleted`).toBe(true);
      }
      for (const id of collectedSet) {
        expect(
          initialIds.has(id) || insertedIds.has(id),
          `seed ${seed}: phantom row ${id} neither initial nor inserted`,
        ).toBe(true);
      }
    }
  });

  it('emitted sequences are strictly monotonic under (sortKey, id) — total order', () => {
    for (const seed of CI_SEEDS) {
      const rand = mulberry32(seed ^ 0xabc);
      const initial = generateItems(rand, 25, `run-${seed}-`, 0);
      let live = [...initial];
      let nextId = 8000;
      const { collected } = paginateAllPages(() => live, 1 + Math.floor(rand() * 6), () => {
        const k = Math.floor(rand() * 3);
        live = [...live, ...generateItems(rand, k, `run-${seed}-in-`, nextId)];
        nextId += k;
      });

      for (let i = 1; i < collected.length; i += 1) {
        const prev = getRunKeyset(asRun(collected[i - 1]));
        const curr = getRunKeyset(asRun(collected[i]));
        expect(
          compareKeyset(prev, curr, 'desc'),
          `seed ${seed}: order not total at ${prev.id} → ${curr.id} (tie broken by memory order?)`,
        ).toBeLessThan(0);
      }
    }
  });

  it('bound cursors round-trip and are rejected under a different scope', () => {
    for (const seed of CI_SEEDS.slice(0, 5)) {
      const rand = mulberry32(seed);
      const items = generateItems(rand, 12, `run-${seed}-`, 0);
      const page = paginateKeyset(items, {
        limit: 5,
        getItemKeyset: getRunKeyset,
        direction: 'desc',
        scope: SCOPE,
      });
      expect(page.nextCursor).toBeTruthy();

      // Accepted under the issuing scope.
      const decoded = decodeBoundCursor(page.nextCursor!, SCOPE);
      expect(decoded.ok).toBe(true);

      // Rejected under a different scope (e.g. the user toggles a filter
      // mid-scroll without restarting from page 1).
      expect(() =>
        paginateKeyset(items, {
          cursor: page.nextCursor,
          limit: 5,
          getItemKeyset: getRunKeyset,
          direction: 'desc',
          scope: OTHER_SCOPE,
        }),
      ).toThrow(CursorMismatchError);
    }
  });

  it('legacy offset cursors reset to page 1 instead of erroring', () => {
    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
      id: `run-${i}`,
      queuedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    }));
    let resetSeen: string | null = null;
    const page = paginateKeyset(items, {
      cursor: '42',
      limit: 3,
      getItemKeyset: getRunKeyset,
      direction: 'desc',
      scope: SCOPE,
      onLegacyCursor: (c) => {
        resetSeen = c;
      },
    });
    expect(resetSeen).toBe('42');
    expect(page.items).toHaveLength(3);
  });

  it('scope fingerprints are stable and filter-sensitive', () => {
    expect(computeCursorScope({ route: 'runs', status: 'failed' })).toBe(
      computeCursorScope({ status: 'failed', route: 'runs' }),
    );
    expect(computeCursorScope({ route: 'runs', status: '' })).toBe(
      computeCursorScope({ route: 'runs', status: undefined }),
    );
    expect(computeCursorScope({ route: 'runs', status: 'failed' })).not.toBe(
      computeCursorScope({ route: 'runs', status: 'passed' }),
    );
  });

  it('encodeBoundCursor payloads are opaque and versioned', () => {
    const payload: KeysetCursor = { sortKey: '2026-01-01T00:00:00.000Z', id: 'run-1' };
    const encoded = encodeBoundCursor(payload, SCOPE);
    // Opaque: the raw sort key/id must not appear verbatim in the token.
    expect(encoded).not.toContain('run-1');
    const decoded = decodeBoundCursor(encoded, SCOPE);
    expect(decoded).toEqual({ ok: true, cursor: payload });
    // Unsupported future versions are rejected distinctly from legacy resets.
    const future = Buffer.from(JSON.stringify({ v: 99, sortKey: 's', id: 'i', scope: SCOPE })).toString('base64');
    expect(decodeBoundCursor(future, SCOPE)).toEqual({ ok: false, reason: 'unsupported-version' });
  });
});
