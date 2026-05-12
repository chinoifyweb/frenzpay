'use client';

/** /admin/* error boundary — same shape as /dashboard/error.tsx. */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { area: 'admin', digest: error.digest ?? 'unknown' },
    });
    // eslint-disable-next-line no-console
    console.error('[admin/error]', error);
  }, [error]);

  function hardReload() {
    if (typeof window === 'undefined') return;
    try {
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
        <h1 className="text-xl font-semibold">Admin panel hit an error</h1>
        <p className="text-sm text-muted-foreground">
          This usually means an old build is still loaded in your browser. A fresh reload will fix it.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2 w-full sm:flex-row sm:justify-center">
        <button
          onClick={hardReload}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-orange-700"
        >
          Reload the panel
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
