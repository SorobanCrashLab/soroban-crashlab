/**
 * Property/fuzz tests for audit keyset pagination stability (#1834).
 *
 * Fixed CI seeds drive a mulberry32 PRNG so every insert interleaving is
 * reproducible. Properties:
 *   1. Appends between page fetches never duplicate or drop rows that were
 *      present (and un-deleted — the audit log is append-only) for the whole
 *      pagination pass.
 *   2. Emitted sequences are strictly decreasing (newest-first keyset).
 *   3. A cursor bound to one filter set is rejected under another.
 */

import { describe, expect, it } from 'vitest';
import { AuditLog, createInMemoryAuditGateway, type AuditEntry } from './audit-log';
import { AuditCursorMismatchError, auditCursorScope, queryAuditEntries } from './audit-query';

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

const CI_SEEDS = [3, 11, 55, 123, 512, 2048, 4242, 7777, 31337, 65535] as const;
const ORG = 'org_property_test';

function seededLog(rand: () => number, count: number): AuditLog {
  let tick = 0;
  const gateway = createInMemoryAuditGateway();
  const log = new AuditLog({
    gateway,
    now: () => new Date(Date.parse('2026-10-01T00:00:00Z') + (tick++ + Math.floor(rand() * 3)) * 3_600_000),
  });
  for (let i = 0; i < count; i += 1) {
    log.append({ action: 'run.delete', target: `run-${i}`, actor: 'alice', orgId: ORG });
  }
  return log;
}

describe('audit query pagination properties (fixed CI seeds)', () => {
  it('appends between pages never lose or duplicate pre-existing rows', () => {
    for (const seed of CI_SEEDS) {
      const rand = mulberry32(seed);
      const log = seededLog(rand, 10 + Math.floor(rand() * 15));
      const scope = auditCursorScope(ORG, {});
      const limit = 1 + Math.floor(rand() * 5);

      const preExisting = new Set(log.list().map((e) => e.sequence));
      const collected: AuditEntry[] = [];
      let cursor: string | null = null;
      let guard = 0;

      while (guard++ < 100) {
        const page = queryAuditEntries(log.list(), ORG, {}, { cursor, limit, scope });
        collected.push(...page.items);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;

        // New audit entries land mid-scroll (append-only: nothing disappears).
        const k = Math.floor(rand() * 3);
        for (let i = 0; i < k; i += 1) {
          log.append({ action: 'token.revoke', target: `key-${seed}-${guard}-${i}`, actor: 'erin', orgId: ORG });
        }
      }

      const collectedSeqs = collected.map((e) => e.sequence);
      expect(new Set(collectedSeqs).size, `seed ${seed}: duplicate audit rows`).toBe(collectedSeqs.length);
      for (const sequence of preExisting) {
        expect(collectedSeqs).toContain(sequence);
      }

      for (let i = 1; i < collectedSeqs.length; i += 1) {
        expect(collectedSeqs[i - 1], `seed ${seed}: newest-first order broken`).toBeGreaterThan(collectedSeqs[i]);
      }
    }
  });

  it('rejects a cursor replayed against a different filter set', () => {
    const rand = mulberry32(4242);
    const log = seededLog(rand, 8);
    const scope = auditCursorScope(ORG, {});
    const first = queryAuditEntries(log.list(), ORG, {}, { limit: 3, scope });
    expect(first.nextCursor).toBeTruthy();

    // Same filter: accepted.
    const second = queryAuditEntries(log.list(), ORG, {}, { cursor: first.nextCursor, limit: 3, scope });
    expect(second.items).toHaveLength(3);

    // Different filter mid-scroll: rejected.
    const otherScope = auditCursorScope(ORG, { actor: 'alice' });
    expect(() =>
      queryAuditEntries(log.list(), ORG, { actor: 'alice' }, { cursor: first.nextCursor, limit: 3, scope: otherScope }),
    ).toThrow(AuditCursorMismatchError);

    // Different org: rejected.
    const otherOrgScope = auditCursorScope('org_other', {});
    expect(() =>
      queryAuditEntries(log.list(), 'org_other', {}, { cursor: first.nextCursor, limit: 3, scope: otherOrgScope }),
    ).toThrow(AuditCursorMismatchError);
  });

  it('reports total of the filter match and hasMore consistently with the page cut', () => {
    const rand = mulberry32(7);
    const log = seededLog(rand, 9);
    const scope = auditCursorScope(ORG, {});
    const first = queryAuditEntries(log.list(), ORG, {}, { limit: 4, scope });
    expect(first.total).toBe(9);
    expect(first.hasMore).toBe(true);
    expect(first.items).toHaveLength(4);

    const last = queryAuditEntries(log.list(), ORG, {}, {
      cursor: first.nextCursor,
      limit: 4,
      scope,
    });
    expect(last.items).toHaveLength(4);
    expect(last.hasMore).toBe(true);

    const final = queryAuditEntries(log.list(), ORG, {}, {
      cursor: last.nextCursor,
      limit: 4,
      scope,
    });
    expect(final.items).toHaveLength(1);
    expect(final.hasMore).toBe(false);
    expect(final.nextCursor).toBeNull();
    expect(final.total).toBe(9);
  });
});
