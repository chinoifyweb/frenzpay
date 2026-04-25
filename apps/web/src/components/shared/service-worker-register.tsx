'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 * Mount this client component anywhere in the root layout.
 *
 * Also listens for the `sw-version-changed` postMessage the SW sends
 * after activating a new VERSION — when received, we hard-reload the
 * tab to flush any stale HTML the browser may have in its disk cache
 * (e.g. responses captured back when Next.js was prerendering pages
 * with `Cache-Control: s-maxage=31536000`). Without this, customers
 * who hit the broken cache once would keep seeing binary garbage on
 * every refresh until they manually cleared their cache.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === 'sw-version-changed') {
        // location.reload() pulls from cache by default; we want a true
        // bypass-cache reload. Setting location.href to itself with a
        // cache-buster query achieves the same effect across browsers
        // without the now-deprecated `reload(true)` argument.
        const url = new URL(window.location.href);
        url.searchParams.set('_swv', String(Date.now()));
        window.location.replace(url.toString());
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        // Force a fresh check for an updated SW immediately. Browsers
        // normally only check every 24h; this catches a deploy on the
        // very next page view.
        try { await reg.update(); } catch { /* swallow */ }
      } catch (err) {
        console.warn('SW registration failed:', err);
      }
    };

    void register();

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}
