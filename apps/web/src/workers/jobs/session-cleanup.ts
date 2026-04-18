/**
 * Job: session-cleanup
 * Schedule: every 15 minutes  (cron: see cron.ts registry)
 *
 * Removes orphaned session rows whose Redis TTL has expired but whose DB rows
 * (if any — we don't persist sessions to Postgres yet) are still hanging around.
 *
 * Currently a STUB. Sessions live only in Redis with native TTL handling, so
 * there's no cleanup work to do today. Wire up when persistent session rows
 * exist in Postgres (e.g. for admin audit trails).
 */
import { logger } from '@frenzpay/logger';

export async function sessionCleanup(): Promise<void> {
  logger.debug('[session-cleanup] stub — no action (sessions live in Redis with TTL)');
}
