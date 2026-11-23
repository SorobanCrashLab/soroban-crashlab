import { describe, expect, it } from 'vitest';
import { readCache, retryDecision, writeCache, type CacheEntry } from './cache';

const NOW = 1_000_000;

describe('TTL cache', () => {
  it('reports miss, fresh, stale and expired entries', () => {
    let store: Record<string, CacheEntry<string>> = {};
    expect(readCache(store, 'key', NOW).decision).toBe('miss');
    store = writeCache(store, 'key', 'payload', NOW - 10_000, '"etag"');
    expect(readCache(store, 'key', NOW)).toMatchObject({
      data: 'payload',
      decision: 'fresh',
      etag: '"etag"',
    });
    expect(readCache(store, 'key', NOW + 40_000).decision).toBe('stale');
    expect(readCache(store, 'key', NOW + 400_000).decision).toBe('expired');
  });

  it('bounds the number of entries', () => {
    let store: Record<string, CacheEntry<number>> = {};
    for (let i = 0; i < 50; i += 1) store = writeCache(store, `key-${i}`, i, i);
    expect(Object.keys(store)).toHaveLength(40);
    expect(store['key-49'].data).toBe(49);
    expect(store['key-0']).toBeUndefined();
  });
});

describe('retryDecision', () => {
  it('obeys Retry-After on 429', () => {
    expect(retryDecision(429, '15', 1, NOW)).toEqual({
      shouldRetry: true,
      delayMs: 15_000,
      reason: 'rate-limited',
    });
  });

  it('backs off on 5xx and stops on 4xx', () => {
    expect(retryDecision(503, null, 0, NOW)).toMatchObject({ shouldRetry: true, reason: 'server-error' });
    expect(retryDecision(503, null, 4, NOW).shouldRetry).toBe(false);
    expect(retryDecision(400, null, 0, NOW)).toEqual({
      shouldRetry: false,
      delayMs: 0,
      reason: 'client-error',
    });
  });
});
