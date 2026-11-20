/**
 * Offline cache strategy for the CrashLab PWA (#2260).
 *
 * Pure classification and freshness rules shared by the service worker and
 * unit tests. Navigations are network-first with an offline fallback; static
 * assets are stale-while-revalidate; read-only API responses are cached for a
 * short window; mutations are never cached.
 */

export type CacheStrategy = 'network-first' | 'stale-while-revalidate' | 'cache-first' | 'never';

export interface RequestClass {
  strategy: CacheStrategy;
  cacheName: string;
  maxAgeMs: number;
}

export const CACHE_VERSION = 'crashlab-v1';
export const STATIC_CACHE = `${CACHE_VERSION}-static`;
export const PAGE_CACHE = `${CACHE_VERSION}-pages`;
export const API_CACHE = `${CACHE_VERSION}-api`;
export const OFFLINE_FALLBACK = '/offline.html';

const STATIC_EXTENSIONS = /\.(?:js|css|svg|png|webp|woff2?|ico|map)$/i;

export function classifyRequest(url: string, method = 'GET'): RequestClass {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return { strategy: 'never', cacheName: '', maxAgeMs: 0 };
  }

  let pathname: string;
  try {
    pathname = new URL(url, 'https://crashlab.local').pathname;
  } catch {
    return { strategy: 'never', cacheName: '', maxAgeMs: 0 };
  }

  if (pathname.startsWith('/api/')) {
    return { strategy: 'network-first', cacheName: API_CACHE, maxAgeMs: 60_000 };
  }
  if (STATIC_EXTENSIONS.test(pathname)) {
    return { strategy: 'stale-while-revalidate', cacheName: STATIC_CACHE, maxAgeMs: 7 * 86_400_000 };
  }
  return { strategy: 'network-first', cacheName: PAGE_CACHE, maxAgeMs: 86_400_000 };
}

export function isFresh(timestamp: number, maxAgeMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return now - timestamp < maxAgeMs;
}

/** Caches kept by the service worker, in activation-cleanup order. */
export function managedCacheNames(): string[] {
  return [STATIC_CACHE, PAGE_CACHE, API_CACHE];
}

export function isObsoleteCache(name: string): boolean {
  return name.startsWith('crashlab-') && !managedCacheNames().includes(name);
}
