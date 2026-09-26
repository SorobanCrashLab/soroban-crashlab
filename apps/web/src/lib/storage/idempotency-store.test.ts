import { describe, expect, it } from 'vitest';
import {
  buildIdempotencyRecord,
  fingerprintPayload,
  IDEMPOTENCY_TTL_SECONDS,
  InMemoryIdempotencyStore,
} from './idempotency-store';
import {
  createIdempotencyKeyTracker,
  parseIdempotencyKey,
  scheduledCampaignIdempotencyKey,
} from '../idempotency-key';

describe('fingerprintPayload', () => {
  it('ignores key order but not values', () => {
    expect(fingerprintPayload({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      fingerprintPayload({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(fingerprintPayload({ a: 1 })).not.toBe(fingerprintPayload({ a: 2 }));
    expect(fingerprintPayload({ list: [1, 2] })).not.toBe(fingerprintPayload({ list: [2, 1] }));
  });
});

describe('InMemoryIdempotencyStore', () => {
  const record = (key: string, now: Date) =>
    buildIdempotencyRecord({ scope: 's', key, payload: { a: 1 }, resourceId: `r-${key}`, response: { ok: true }, now });

  it('pins the retention window at 24 hours', () => {
    expect(IDEMPOTENCY_TTL_SECONDS).toBe(86_400);
  });

  it('stores once and hands later writers the first record', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const store = new InMemoryIdempotencyStore(() => now);
    const first = record('k', now);

    expect(await store.putIfAbsent(first)).toBe(first);
    const second = { ...record('k', now), resourceId: 'r-other' };
    expect((await store.putIfAbsent(second)).resourceId).toBe('r-k');
  });

  it('expires records after the TTL so the key can be reused', async () => {
    let current = new Date('2026-01-01T00:00:00.000Z');
    const store = new InMemoryIdempotencyStore(() => current);
    await store.putIfAbsent(record('k', current));

    current = new Date(current.getTime() + IDEMPOTENCY_TTL_SECONDS * 1000 - 1);
    expect(await store.get('s', 'k')).not.toBeNull();

    current = new Date(current.getTime() + 1);
    expect(await store.get('s', 'k')).toBeNull();
  });

  it('isolates scopes', async () => {
    const now = new Date();
    const store = new InMemoryIdempotencyStore(() => now);
    await store.putIfAbsent(record('k', now));
    expect(await store.get('other-scope', 'k')).toBeNull();
  });
});

describe('idempotency keys', () => {
  it('accepts a missing header and rejects blank, oversized or non-ASCII keys', () => {
    expect(parseIdempotencyKey(null)).toEqual({ ok: true, key: null });
    expect(parseIdempotencyKey(' abc-123 ')).toEqual({ ok: true, key: 'abc-123' });
    expect(parseIdempotencyKey('').ok).toBe(false);
    expect(parseIdempotencyKey('a'.repeat(256)).ok).toBe(false);
    expect(parseIdempotencyKey('has space').ok).toBe(false);
    expect(parseIdempotencyKey('ключ').ok).toBe(false);
  });

  it('derives scheduled keys from schedule id and slot only', () => {
    const slot = '2026-03-01T08:30:00.000Z';
    expect(scheduledCampaignIdempotencyKey('sched-1', slot)).toBe(scheduledCampaignIdempotencyKey('sched-1', slot));
    expect(scheduledCampaignIdempotencyKey('sched-1', slot)).not.toBe(scheduledCampaignIdempotencyKey('sched-2', slot));
  });

  it('reuses a key for an unchanged payload and rotates it on change or reset', () => {
    let n = 0;
    const tracker = createIdempotencyKeyTracker(() => `key-${++n}`);

    expect(tracker.keyFor({ a: 1 })).toBe('key-1');
    expect(tracker.keyFor({ a: 1 })).toBe('key-1');
    expect(tracker.keyFor({ a: 2 })).toBe('key-2');
    tracker.reset();
    expect(tracker.keyFor({ a: 2 })).toBe('key-3');
  });
});
