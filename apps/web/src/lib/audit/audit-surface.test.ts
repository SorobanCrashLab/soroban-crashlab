/**
 * Tamper-evident audit surface (#1895): checkpoints, query, export scoping and
 * the append-only gate.
 */

import { describe, expect, it } from 'vitest';
import {
  AppendOnlyViolationError,
  AuditLog,
  createAppendOnlyGateway,
  createInMemoryAuditGateway,
  hashEntry,
  verifyChain,
  type AuditEntry,
} from './audit-log';
import { createCheckpoint, verifyAuditIntegrity } from './audit-checkpoint';
import {
  AUDIT_RETENTION_POLICY,
  decodeCursor,
  DEFAULT_AUDIT_ORG_ID,
  exportAuditEntries,
  queryAuditEntries,
} from './audit-query';

const KEY = 'checkpoint-test-key';
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbb';

function seededLog() {
  let tick = 0;
  const gateway = createInMemoryAuditGateway();
  const log = new AuditLog({ gateway, now: () => new Date(Date.parse('2026-10-01T00:00:00Z') + tick++ * 3_600_000) });
  log.append({ action: 'token.revoke', target: 'key-1', actor: 'alice', orgId: ORG_A });
  log.append({ action: 'run.delete', target: 'run-1', actor: 'bob', orgId: ORG_B });
  log.append({ action: 'rbac.change', target: 'github:carol', actor: 'alice', orgId: ORG_A });
  log.append({ action: 'token.revoke', target: 'key-2', actor: 'dave', orgId: ORG_A });
  log.append({ action: 'dlq.purge', target: 'queue', actor: 'system' });
  return { log, gateway };
}

/** Rewrites the whole log from entry `from` with recomputed hashes — a careful attacker. */
function rewriteFrom(entries: AuditEntry[], from: number, patch: Partial<AuditEntry>): AuditEntry[] {
  const out = entries.map((entry) => ({ ...entry }));
  for (let i = from - 1; i < out.length; i += 1) {
    const { hash: _old, ...rest } = { ...out[i], ...(i === from - 1 ? patch : {}) };
    const relinked = { ...rest, prevHash: i === 0 ? rest.prevHash : out[i - 1].hash };
    out[i] = { ...relinked, hash: hashEntry(relinked) };
  }
  return out;
}

describe('chain + checkpoint verification', () => {
  it('verifies an untouched log against its checkpoint', () => {
    const { log } = seededLog();
    const checkpoint = createCheckpoint(log.list(), KEY)!;
    expect(verifyAuditIntegrity(log.list(), checkpoint, KEY)).toMatchObject({ status: 'intact', checkpoint: 'verified' });
  });

  it('names the tampered record when an entry is edited in place', () => {
    const { log } = seededLog();
    const entries = log.list();
    entries[2] = { ...entries[2], actor: 'mallory' };
    expect(verifyAuditIntegrity(entries, createCheckpoint(log.list(), KEY), KEY)).toMatchObject({
      status: 'broken',
      brokenAt: 3,
    });
  });

  it('catches a fully re-hashed rewrite the chain alone accepts', () => {
    const { log } = seededLog();
    const checkpoint = createCheckpoint(log.list(), KEY)!;
    const forged = rewriteFrom(log.list(), 3, { actor: 'mallory' });

    expect(verifyChain(forged).status).toBe('intact');
    expect(verifyAuditIntegrity(forged, checkpoint, KEY)).toMatchObject({ status: 'broken', checkpoint: 'mismatch' });
  });

  it('catches tail truncation', () => {
    const { log } = seededLog();
    const checkpoint = createCheckpoint(log.list(), KEY)!;
    const truncated = log.list().slice(0, 3);

    expect(verifyChain(truncated).status).toBe('intact');
    expect(verifyAuditIntegrity(truncated, checkpoint, KEY)).toMatchObject({
      status: 'broken',
      brokenAt: 4,
      checkpoint: 'truncated',
    });
  });

  it('rejects a forged checkpoint and reports a missing one', () => {
    const { log } = seededLog();
    const checkpoint = createCheckpoint(log.list(), KEY)!;
    expect(verifyAuditIntegrity(log.list(), checkpoint, 'other-key').checkpoint).toBe('invalid_signature');
    expect(verifyAuditIntegrity(log.list(), { ...checkpoint, sequence: 2 }, KEY).checkpoint).toBe('invalid_signature');
    expect(verifyAuditIntegrity(log.list(), null, KEY).checkpoint).toBe('missing');
  });

  it('keeps hashes of entries written before orgId existed', () => {
    const { log } = seededLog();
    const legacy = log.list()[4];
    expect(legacy.orgId).toBeUndefined();
    const { hash, ...rest } = legacy;
    expect(hashEntry(rest)).toBe(hash);
    // And orgId is covered by the hash when present.
    const scoped = log.list()[0];
    expect(verifyChain([{ ...scoped, orgId: ORG_B }]).status).toBe('broken');
  });
});

describe('query', () => {
  it('filters by actor, action, target and time within the viewer org', () => {
    const { log } = seededLog();
    const entries = log.list();
    expect(queryAuditEntries(entries, ORG_A, { actor: 'ALICE' }).items.map((e) => e.sequence)).toEqual([3, 1]);
    expect(queryAuditEntries(entries, ORG_A, { action: 'token.revoke' }).items.map((e) => e.sequence)).toEqual([4, 1]);
    expect(queryAuditEntries(entries, ORG_A, { target: 'carol' }).items.map((e) => e.sequence)).toEqual([3]);
    expect(
      queryAuditEntries(entries, ORG_A, { since: '2026-10-01T01:00:00Z', until: '2026-10-01T02:00:00Z' }).items.map(
        (e) => e.sequence,
      ),
    ).toEqual([3]);
    expect(queryAuditEntries(entries, ORG_A, { actor: 'bob' }).items).toEqual([]);
  });

  it('paginates by keyset, stable while new entries arrive', () => {
    const { log } = seededLog();
    const first = queryAuditEntries(log.list(), ORG_A, {}, { limit: 2 });
    expect(first.items.map((e) => e.sequence)).toEqual([4, 3]);
    expect(decodeCursor(first.nextCursor)).toBe(3);

    log.append({ action: 'token.revoke', target: 'key-3', actor: 'erin', orgId: ORG_A });
    const second = queryAuditEntries(log.list(), ORG_A, {}, { cursor: first.nextCursor, limit: 2 });
    expect(second.items.map((e) => e.sequence)).toEqual([1]);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', () => {
    expect(() => queryAuditEntries([], ORG_A, {}, { cursor: 'not-a-cursor' })).toThrow();
  });
});

describe('export scoping (cross-tenant)', () => {
  it('exports only the viewer org, in CSV and JSON', () => {
    const { log } = seededLog();
    const json = JSON.parse(exportAuditEntries(log.list(), ORG_A, 'json').body);
    expect(json.orgId).toBe(ORG_A);
    expect(json.entries.map((e: AuditEntry) => e.sequence)).toEqual([4, 3, 1]);
    expect(json.entries.every((e: AuditEntry) => e.orgId === ORG_A)).toBe(true);

    const csv = exportAuditEntries(log.list(), ORG_B, 'csv');
    expect(csv.contentType).toBe('text/csv');
    expect(csv.body.split('\n')).toHaveLength(2);
    expect(csv.body).toContain('run-1');
    expect(csv.body).not.toContain('key-1');
  });

  it('attributes org-less entries to the default org only', () => {
    const { log } = seededLog();
    const exported = JSON.parse(exportAuditEntries(log.list(), DEFAULT_AUDIT_ORG_ID, 'json').body);
    expect(exported.entries.map((e: AuditEntry) => e.target)).toEqual(['queue']);
  });
});

describe('append-only gate', () => {
  it('has no update or delete path on the log', () => {
    const methods = Object.getOwnPropertyNames(AuditLog.prototype).filter((name) => name !== 'constructor');
    expect(methods.sort()).toEqual(['append', 'list', 'verify']);
  });

  it('refuses edits, deletions and truncation at the gateway', () => {
    const { gateway } = seededLog();
    const guarded = createAppendOnlyGateway(gateway);
    const entries = guarded.load();

    expect(() => guarded.save(entries.slice(0, 4))).toThrow(AppendOnlyViolationError);
    expect(() => guarded.save([{ ...entries[0], actor: 'mallory' }, ...entries.slice(1)])).toThrow(/cannot be modified/);
    expect(() => guarded.save([entries[1], entries[0], ...entries.slice(2)])).toThrow(AppendOnlyViolationError);
    expect(guarded.load()).toEqual(entries);
  });

  it('still accepts a genuine append, even after storage was tampered with', () => {
    const { log, gateway } = seededLog();
    const tampered = gateway.load();
    tampered[0] = { ...tampered[0], actor: 'mallory' };
    gateway.save(tampered);

    // The guard compares against what is stored, so evidence of tampering is
    // preserved and auditing keeps working.
    expect(() => log.append({ action: 'run.delete', target: 'run-9' })).not.toThrow();
    expect(log.verify()).toMatchObject({ status: 'broken', brokenAt: 1 });
  });

  it('declares a long-lived retention class with no deletion', () => {
    expect(AUDIT_RETENTION_POLICY).toMatchObject({ class: 'long-lived', deletion: 'none' });
    expect(AUDIT_RETENTION_POLICY.minimumRetentionDays).toBeGreaterThan(365);
  });
});
