/**
 * Next.js instrumentation hook — runs once per process (Node + Edge runtimes)
 * at boot. Used to initialise Sentry server-side.
 *
 * Runs BEFORE the first request is handled. Keep imports lazy + guarded so a
 * missing/empty SENTRY_DSN just skips instrumentation instead of throwing.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import('@sentry/nextjs');

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'production',
      // Low sample rate — this is a fintech, we don't need 100% of traces, just
      // enough to debug hot endpoints. Errors are still captured at 100%.
      tracesSampleRate: 0.1,
      // Don't spam Sentry with noisy 4xx user errors — those are expected.
      beforeSend(event, hint) {
        const err = hint.originalException;
        // Drop Prisma 'Record not found' — these are handled via 404 responses.
        if (err instanceof Error && err.message.includes('P2025')) return null;
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'production',
      tracesSampleRate: 0.1,
    });
  }
}

// Required by @sentry/nextjs for nested-route error propagation.
// This is a re-export — the SDK wires it up for us.
export async function onRequestError(
  ...args: Parameters<NonNullable<typeof import('@sentry/nextjs')['captureRequestError']>>
) {
  if (!process.env.SENTRY_DSN) return;
  const { captureRequestError } = await import('@sentry/nextjs');
  return captureRequestError(...args);
}
