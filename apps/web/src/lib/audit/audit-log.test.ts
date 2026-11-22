import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLog,
  createInMemoryAuditGateway,
  GENESIS_HASH,
  hashEntry,
  SYSTEM_ACTOR,
  verifyChain,
  type AuditEntry,
} from './audit-log';
import { REDACTED, redactMetadata, redactTokenLike, redactUrl, TOKEN_PREFIX_LENGTH } from './redaction';
import {
  AUDIT_CSV_HEADERS,
  AUDIT_PAGE_SIZE,
  escapeCsvField,
  filterAuditEntries,
  pageCount,
  pageOf,
  toCsv,
} from './audit-view-utils';
import { parseAuditEntries, recordAuditEvent, resetAuditLog } from './audit-sink';

function makeLog(startAt = '2026-01-01T00:00:00.000Z') {
  let tick = 0;
  const gateway = createInMemoryAuditGateway();
  const log = new AuditLog({
    gateway,
    now: () => new Date(Date.parse(startAt) + tick++ * 1000),
  });
  return { log, gateway };
}

describe('append chokepoint', () => {
  it('assigns sequence, timestamp and hash itself', () => {
    const { log } = makeLog();
    const entry = log.append({ action: 'run.delete', target: 'run-1' });

    expect(entry.sequence).toBe(1);
    expect(entry.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores caller-supplied sequence, timestamp and hash', () => {
    const { log } = makeLog();
    // A poisoned call site cannot forge position or time: the append input has
    // no such fields, and anything extra is dropped rather than trusted.
    const entry = log.append({
      action: 'run.delete',
      target: 'run-1',
      ...({ sequence: 99, timestamp: '1999-01-01T00:00:00.000Z', hash: 'deadbeef' } as object),
    });

    expect(entry.sequence).toBe(1);
    expect(entry.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(entry.hash).not.toBe('deadbeef');
  });

  it('falls back to the system actor when no principal is resolved', () => {
    const { log } = makeLog();
    expect(log.append({ action: 'dlq.purge', target: 'queue' }).actor).toBe(SYSTEM_ACTOR);
    expect(log.append({ action: 'dlq.purge', target: 'queue', actor: '   ' }).actor).toBe(SYSTEM_ACTOR);
    expect(log.append({ action: 'dlq.purge', target: 'queue', actor: 'ana' }).actor).toBe('ana');
  });

  it('chains each entry to its predecessor', () => {
    const { log } = makeLog();
    const first = log.append({ action: 'run.delete', target: 'run-1' });
    const second = log.append({ action: 'token.revoke', target: 'key-1' });

    expect(second.prevHash).toBe(first.hash);
    expect(second.sequence).toBe(2);
    expect(log.verify()).toEqual({ status: 'intact' });
  });

  it('appends only — existing entries are never rewritten', () => {
    const { log, gateway } = makeLog();
    log.append({ action: 'run.delete', target: 'run-1' });
    const snapshot = JSON.stringify(gateway.load());

    log.append({ action: 'run.delete', target: 'run-2' });
    expect(JSON.stringify(gateway.load().slice(0, 1))).toBe(snapshot);
  });
});

describe('chain verification', () => {
  function threeEntries(): AuditEntry[] {
    const { log } = makeLog();
    log.append({ action: 'run.delete', target: 'run-1' });
    log.append({ action: 'dlq.replay', target: 'https://hooks.example.com/a' });
    log.append({ action: 'rbac.change', target: 'maintainer-mode' });
    return log.list();
  }

  it('reports an empty log distinctly from an intact one', () => {
    expect(verifyChain([])).toEqual({ status: 'empty' });
    expect(verifyChain(threeEntries())).toEqual({ status: 'intact' });
  });

  it('detects a modified entry and names where', () => {
    const entries = threeEntries();
    entries[1] = { ...entries[1], target: 'https://hooks.example.com/tampered' };

    const result = verifyChain(entries);
    expect(result.status).toBe('broken');
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain('modified');
  });

  it('detects a re-hashed entry, because the link to entry 3 no longer holds', () => {
    const entries = threeEntries();
    // A careful editor recomputes the hash of the entry they changed — but the
    // next entry still carries the old prevHash.
    const { hash: _dropped, ...rest } = entries[1];
    const edited = { ...rest, target: 'tampered' };
    entries[1] = { ...edited, hash: hashEntry(edited) };

    const result = verifyChain(entries);
    expect(result.status).toBe('broken');
    expect(result.brokenAt).toBe(3);
  });

  it('detects a deleted entry', () => {
    const entries = threeEntries();
    entries.splice(1, 1);
    expect(verifyChain(entries).status).toBe('broken');
  });

  it('detects a reordered log', () => {
    const entries = threeEntries();
    const reordered = [entries[1], entries[0], entries[2]];
    expect(verifyChain(reordered).status).toBe('broken');
  });
});

describe('redaction', () => {
  it('keeps only a short token prefix', () => {
    expect(redactTokenLike('sk_live_abcdefghijklmnop')).toBe(`sk_liv…${REDACTED}`);
    expect(redactTokenLike('sk_liv')).toBe(REDACTED);
    expect(TOKEN_PREFIX_LENGTH).toBe(6);
  });

  it('strips URL query strings, fragments and inline credentials', () => {
    expect(redactUrl('https://hooks.example.com/a?signature=abc&token=xyz#frag')).toBe(
      'https://hooks.example.com/a',
    );
    expect(redactUrl('https://user:pass@hooks.example.com/a')).toBe('https://hooks.example.com/a');
  });

  it('redacts secret-shaped keys at any depth', () => {
    const redacted = redactMetadata({
      apiKey: 'AKIAIOSFODNN7EXAMPLE',
      nested: { secretAccessKey: 'wJalrXUtnFEMI', authorization: 'Bearer abc' },
      list: [{ password: 'hunter2' }],
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('wJalrXUtnFEMI');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('Bearer abc');
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts PII-shaped keys entirely', () => {
    const redacted = redactMetadata({ email: 'a@b.com', ipAddress: '10.0.0.1' }) as Record<string, unknown>;
    expect(redacted.email).toBe(REDACTED);
    expect(redacted.ipAddress).toBe(REDACTED);
  });

  it('keeps benign values so entries stay useful', () => {
    expect(redactMetadata({ runCount: 12, enabled: true, section: 'alertRules' })).toEqual({
      enabled: true,
      runCount: 12,
      section: 'alertRules',
    });
  });

  it('drops values it cannot classify rather than stringifying them', () => {
    const redacted = redactMetadata({ fn: () => undefined, sym: Symbol('x') }) as Record<string, unknown>;
    expect(redacted.fn).toBeUndefined();
    expect(redacted.sym).toBeUndefined();
  });

  it('applies redaction at append time, not at render time', () => {
    const { log, gateway } = makeLog();
    log.append({
      action: 'token.revoke',
      target: 'key-1',
      metadata: { token: 'sk_live_supersecretvalue', callbackUrl: 'https://x.example/cb?sig=leak' },
    });

    // The leak classes must be absent from what is actually stored.
    const stored = JSON.stringify(gateway.load());
    expect(stored).not.toContain('supersecretvalue');
    expect(stored).not.toContain('sig=leak');
  });
});

describe('viewer utilities', () => {
  const entries = (() => {
    const { log } = makeLog('2026-02-01T00:00:00.000Z');
    log.append({ action: 'run.delete', target: 'run-1', actor: 'ana' });
    log.append({ action: 'dlq.purge', target: 'queue', actor: 'dmitri' });
    log.append({ action: 'run.delete', target: 'run-2', actor: 'ana' });
    return log.list();
  })();

  it('filters by actor, action and target', () => {
    expect(filterAuditEntries(entries, { actor: 'ana' })).toHaveLength(2);
    expect(filterAuditEntries(entries, { action: 'dlq.purge' })).toHaveLength(1);
    expect(filterAuditEntries(entries, { target: 'run-2' })).toHaveLength(1);
    expect(filterAuditEntries(entries, { action: 'all' })).toHaveLength(3);
  });

  it('filters by a lower time bound', () => {
    expect(filterAuditEntries(entries, { since: '2026-02-01T00:00:02.000Z' })).toHaveLength(1);
  });

  it('paginates and clamps out-of-range pages', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ ...entries[0], sequence: index + 1 }));
    expect(pageCount(60)).toBe(3);
    expect(pageOf(many, 1)).toHaveLength(AUDIT_PAGE_SIZE);
    expect(pageOf(many, 3)).toHaveLength(10);
    expect(pageOf(many, 99)).toHaveLength(10);
    expect(pageOf(many, 0)[0].sequence).toBe(1);
  });

  it('escapes CSV fields, including spreadsheet formula injection', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('=cmd|calc')).toBe("'=cmd|calc");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('exports a header row and one row per entry', () => {
    const csv = toCsv(entries).split('\n');
    expect(csv[0]).toBe(AUDIT_CSV_HEADERS.join(','));
    expect(csv).toHaveLength(entries.length + 1);
    expect(csv[1]).toContain('run-1');
  });
});

describe('audit sink', () => {
  beforeEach(() => resetAuditLog());

  it('records through the singleton without throwing', () => {
    expect(() => recordAuditEvent({ action: 'dlq.purge', target: 'queue' })).not.toThrow();
  });

  it('reads corrupt stored history as an empty log', () => {
    expect(parseAuditEntries(null)).toEqual([]);
    expect(parseAuditEntries('not json')).toEqual([]);
    expect(parseAuditEntries('{"not":"an array"}')).toEqual([]);
  });
});
