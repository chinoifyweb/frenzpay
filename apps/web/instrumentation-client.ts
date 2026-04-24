/**
 * Next.js 15 client instrumentation — runs once when the browser bundle boots.
 * Initialises Sentry in the browser. The DSN is safe to expose (it's designed
 * to ship in client bundles; rate-limits + project-level access control stop
 * abuse).
 *
 * Read via NEXT_PUBLIC_SENTRY_DSN so the value is inlined at build time. If
 * it's unset the init is a no-op.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    // Browser-side trace sampling. 10% is plenty for a fintech — we care
    // most about errors and slow-page reports.
    tracesSampleRate: 0.1,
    // Don't ship PII — we sign users in with email; nothing else needs to
    // leave the browser for error context.
    sendDefaultPii: false,
    // Replay is opt-in and costs extra on Sentry's pricing plan. Off for now.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Drop benign noise from third-party scripts.
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      // Network-level cancellations — not actionable
      'Load failed',
      'NetworkError when attempting to fetch resource',
    ],
  });
}

// Capture router navigation errors (Next.js 15 convention)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
