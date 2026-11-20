/*
 * CrashLab service worker (#2260).
 *
 * Navigations: network-first, fallback to cached page then /offline.html.
 * Static assets: stale-while-revalidate.
 * API reads: network-first with a short-lived cache; mutations are never cached.
 *
 * The strategy constants mirror src/lib/offline/cache-strategy.ts; keep the two
 * in sync when bumping CACHE_VERSION.
 */
const CACHE_VERSION = 'crashlab-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const API_CACHE = `${CACHE_VERSION}-api`;
const MANAGED = [STATIC_CACHE, PAGE_CACHE, API_CACHE];
const OFFLINE_FALLBACK = '/offline.html';
const STATIC_EXTENSIONS = /\.(?:js|css|svg|png|webp|woff2?|ico|map)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_FALLBACK])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('crashlab-') && !MANAGED.includes(name))
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || network || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match(OFFLINE_FALLBACK);
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET' && request.method !== 'HEAD') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
  event.respondWith(networkFirst(request, PAGE_CACHE));
});
