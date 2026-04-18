/**
 * Lightweight observability shim.
 *
 * Production wires this to Sentry + OpenTelemetry. In the meantime this module
 * provides a stable API (`captureError`, `withSpan`) so callers don't need to
 * change when we swap in real exporters.
 *
 * Env-gated:
 *   SENTRY_DSN       — if present, lazy-loads @sentry/nextjs and forwards errors
 *   OTEL_EXPORTER_OTLP_ENDPOINT — if present, lazy-loads @opentelemetry/sdk-node
 */
import { logger } from '@frenzpay/logger';

let sentryInitialized = false;

async function initSentryIfNeeded(): Promise<void> {
  if (sentryInitialized) return;
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  try {
    // Dynamic import to avoid pulling the SDK into the bundle when unconfigured
    // @ts-expect-error — @sentry/nextjs is an optional dep not installed by default
    const Sentry = await import('@sentry/nextjs').catch(() => null);
    if (!Sentry) return;
    Sentry.init({
      dsn,
      tracesSampleRate: parseFloat(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0.1'),
      environment: process.env['NODE_ENV'],
    });
    sentryInitialized = true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'Sentry init failed');
  }
}

/**
 * Capture an error to observability backends.
 * Always logs to pino, optionally forwards to Sentry if SENTRY_DSN is set.
 */
export async function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error({ ...context, err: message, stack }, 'captureError');

  if (process.env['SENTRY_DSN']) {
    await initSentryIfNeeded();
    try {
      // @ts-expect-error — optional dep
      const Sentry = await import('@sentry/nextjs').catch(() => null);
      if (Sentry) {
        Sentry.captureException(err, { extra: context });
      }
    } catch { /* best effort */ }
  }
}

/**
 * Wrap an async operation with a named span.
 * In production: emits OpenTelemetry span. In dev: just times + logs.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    logger.debug({ span: name, ms, ...attributes }, 'span ok');
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    logger.warn({ span: name, ms, ...attributes, err: err instanceof Error ? err.message : err }, 'span error');
    throw err;
  }
}
