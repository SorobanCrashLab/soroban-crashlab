import { describe, expect, it } from 'vitest';
import {
  API_CACHE,
  CACHE_VERSION,
  OFFLINE_FALLBACK,
  STATIC_CACHE,
  classifyRequest,
  isFresh,
  isObsoleteCache,
  managedCacheNames,
} from './cache-strategy';
import {
  acknowledge,
  enqueue,
  parseQueue,
  recordAttempt,
  replayableMutations,
  serializeQueue,
} from './offline-queue';

describe('offline cache strategy', () => {
  it('classifies navigations, assets and API reads', () => {
    expect(classifyRequest('/runs/run-1')).toEqual({
      strategy: 'network-first', cacheName: `${CACHE_VERSION}-pages`, maxAgeMs: 86_400_000,
    });
    expect(classifyRequest('/_next/static/chunk.js')).toEqual({
      strategy: 'stale-while-revalidate', cacheName: STATIC_CACHE, maxAgeMs: 7 * 86_400_000,
    });
    expect(classifyRequest('/api/runs')).toEqual({
      strategy: 'network-first', cacheName: API_CACHE, maxAgeMs: 60_000,
    });
  });

  it('never caches mutations', () => {
    expect(classifyRequest('/api/runs', 'POST').strategy).toBe('never');
    expect(classifyRequest('/runs', 'DELETE').cacheName).toBe('');
  });

  it('checks freshness and cleans obsolete caches', () => {
    expect(isFresh(1000, 500, 1200)).toBe(true);
    expect(isFresh(1000, 100, 1200)).toBe(false);
    expect(isFresh(0, 500, 100)).toBe(false);
    expect(isObsoleteCache('crashlab-v0-static')).toBe(true);
    expect(isObsoleteCache(STATIC_CACHE)).toBe(false);
    expect(managedCacheNames()).toEqual([STATIC_CACHE, `${CACHE_VERSION}-pages`, API_CACHE]);
    expect(OFFLINE_FALLBACK).toBe('/offline.html');
  });
});

describe('offline mutation queue', () => {
  const base = { method: 'POST' as const, url: '/api/campaigns', idempotencyKey: 'k1', now: 100 };

  it('enqueues once per idempotency key and serializes', () => {
    const first = enqueue([], { ...base, id: 'm1' });
    expect(enqueue(first, { ...base, id: 'm2' })).toHaveLength(1);
    const parsed = parseQueue(serializeQueue(first));
    expect(parsed).toEqual(first);
  });

  it('acknowledges and retries with bounded attempts', () => {
    let queue = enqueue([], { ...base, id: 'm1' });
    expect(replayableMutations(queue)).toHaveLength(1);
    for (let i = 0; i < 5; i += 1) queue = recordAttempt(queue, 'm1');
    expect(replayableMutations(queue)).toHaveLength(0);
    expect(acknowledge(queue, 'm1')).toEqual([]);
  });

  it('ignores malformed persisted queues', () => {
    expect(parseQueue('not json')).toEqual([]);
    expect(parseQueue('{"not":"an array"}')).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
  });
});
