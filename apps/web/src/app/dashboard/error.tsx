'use client';

/**
 * /dashboard/* error boundary.
 *
 * Catches client-side render errors INSIDE the dashboard segment so
 * customers see a real, actionable recovery screen instead of Next.js's
 * default 'Application error: a client-side exception has occurred (see
 * the browser console for more information).' message, which is useless
 * to non-engineers.
 *
 * The most common cause we've seen: stale JS chunks from a previous
 * deploy still cached in the browser / service worker. The Try again
 * button does a hard reload that bypasses the SW + http cache via a
 * timestamp query param.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry if configured. The digest is the server-side
    // request id that ties this client error to the server log line.
    Sentry.captureException(error, {
      tags: { area: 'dashboard', digest: error.digest ?? 'unknown' },
    });
    // eslint-disable-next-line no-console
    console.error('[dashboard/error]', error);
  }, [error]);

  function hardReload() {
    if (typeof window === 'undefined') return;
    try {
      // Tell the SW to drop its caches, then bust the URL.
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => void r.unregister());
        }).catch(() => {});
      }
      if ('caches' in window) {
        window.caches.keys().then((keys) => keys.forEach((k) => window.caches.delete(k))).catch(() => {});
      }
    } catch { /* ignore */ }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
        <p className="text-sm text-muted-foreground">
          This usually means your browser is holding onto an old copy of the app from a previous visit. A fresh reload will fix it.
        </p>
        {/* Surface the actual error so a customer reporting it can paste
            us a useful message instead of just "something went wrong".
            Until Sentry is wired (SENTRY_DSN env var), this is our only
            window into prod render errors. */}
        {error.message && (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">
              Show technical details (for support)
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-[10px] leading-tight text-left">
              {error.message}
              {error.stack ? '\n\n' + error.stack.split('\n').slice(0, 6).join('\n') : ''}
            </pre>
          </details>
        )}
      </div>
      <div className="flex flex-col items-stretch gap-2 w-full sm:flex-row sm:justify-center">
        <button
          onClick={hardReload}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Reload the app
        </button>
        <button
          onClick={() => reset()}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </div>
      {error.digest && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-2">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
