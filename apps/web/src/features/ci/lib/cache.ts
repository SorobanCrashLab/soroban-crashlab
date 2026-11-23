/**
 * Bounded, TTL + stale-while-revalidate cache for the CI dashboard (#2314).
 *
 * Pure helpers operate on a plain record so they can be unit tested; the hook
 * owns the module-level Map and reuses these decisions. Entries carry an ETag,
 * letting a revalidation send `If-None-Match` and skip an unchanged payload.
 */

import { assessFreshness, retryAfterMs, type FreshnessState } from './freshness';

export interface CacheEntry<T> {
  data: T;
  storedAt: number;
  etag?: string;
}

export type CacheDecision = 'miss' | FreshnessState;

export interface CacheLookup<T> {
  data: T | null;
  decision: CacheDecision;
  storedAt?: number;
  etag?: string;
}

export function readCache<T>(
  store: Readonly<Record<string, CacheEntry<T>>>,
  key: string,
  nowMs = Date.now(),
  ttlMs = 30_000,
  staleMs = 300_000,
): CacheLookup<T> {
  const entry = store[key];
  if (!entry) return { data: null, decision: 'miss' };
  const freshness = assessFreshness(entry.storedAt, nowMs, ttlMs, staleMs);
  return {
    data: entry.data,
    decision: freshness.state,
    storedAt: entry.storedAt,
    etag: entry.etag,
  };
}

export function writeCache<T>(
  store: Record<string, CacheEntry<T>>,
  key: string,
  data: T,
  storedAt = Date.now(),
  etag?: string,
): Record<string, CacheEntry<T>> {
  const next = { ...store, [key]: { data, storedAt, etag } };
  // Keep memory bounded even when users switch filters frequently.
  const keys = Object.keys(next);
  if (keys.length > 40) {
    for (const stale of keys
      .sort((a, b) => next[a].storedAt - next[b].storedAt)
      .slice(0, keys.length - 40)) {
      delete next[stale];
    }
  }
  return next;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  reason: 'ok' | 'rate-limited' | 'server-error' | 'client-error';
}

/**
 * Rate-limit-aware retry decision. A 429 always obeys `Retry-After`; otherwise
 * a small exponential backoff applies to 5xx only. 4xx (except 429) is final.
 */
export function retryDecision(
  status: number,
  retryAfterHeader: string | null,
  attempt: number,
  nowMs = Date.now(),
): RetryDecision {
  if (status === 429) {
    return {
      shouldRetry: true,
      delayMs: retryAfterMs(retryAfterHeader, nowMs),
      reason: 'rate-limited',
    };
  }
  if (status >= 500) {
    return {
      shouldRetry: attempt < 3,
      delayMs: Math.min(8_000, 500 * 2 ** Math.max(0, attempt)),
      reason: 'server-error',
    };
  }
  return { shouldRetry: false, delayMs: 0, reason: 'client-error' };
}
