/**
 * FrenzPay service worker — minimal offline-first shell.
 *
 * Strategy:
 * - Never cache API responses, auth endpoints, or webhooks (pass-through).
 * - Cache static assets (JS, CSS, fonts, images) stale-while-revalidate.
 * - Serve /offline as a fallback for navigation requests when the network fails.
 */

// IMPORTANT: bump VERSION any time we ship a deploy that needs to flush
// browser-side state (HTML cache regression, broken chunks, etc). The
// `activate` handler clears all caches AND broadcasts a reload signal
// so open tabs flush stale HTML their browser may have disk-cached
// from a prior bad cache-control response.
const VERSION = 'v3';
const STATIC_CACHE = `frenzpay-static-${VERSION}`;
const OFFLINE_URL = '/offline';

const CORE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Tell every open tab to do a hard reload so any HTML it has in
      // the browser disk cache (from a prior bad-cache-control
      // response) is flushed and replaced with a fresh fetch.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.postMessage({ type: 'sw-version-changed', version: VERSION }); } catch { /* swallow */ }
      }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always fresh: API + auth + webhooks
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr')
  ) {
    return; // let browser handle
  }

  // Navigation requests: network-first, fall back to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match(OFFLINE_URL);
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (request.method === 'GET' && /\.(?:js|css|woff2?|png|jpg|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })(),
    );
  }
});
