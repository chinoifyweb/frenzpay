/**
 * FrenzPay cron worker — long-running Node process managed by PM2.
 *
 * Runs scheduled background jobs inside the same Next.js build output, so it
 * has full access to Prisma, Redis, the ledger package, and all env config
 * without duplicating bootstrap code.
 *
 * Each job module is a pure `async () => void` function. Failures are logged
 * but do NOT crash the worker — one bad job shouldn't take the process down.
 * Distributed locking (for multi-worker safety) is the job's responsibility;
 * use Redis `SET NX EX` to gate work when there's any chance of concurrency.
 *
 * Jobs registered here:
 *   every 15 min    session-cleanup          stub
 *   02:00 daily     sanctions-refresh        stub
 *   03:00 daily     ongoing-screening        stub
 *   04:00 daily     retention-sweep          stub
 *   05:00 daily     audit-export             stub
 *   hourly          process-matured-locks    implemented (see jobs/)
 *
 * Stubs log "not yet implemented" and no-op. As features land, their modules
 * get fleshed out — the scheduler entry doesn't need to change.
 */

import cron from 'node-cron';
import { logger } from '@frenzpay/logger';
import { sessionCleanup } from './jobs/session-cleanup';
import { sanctionsRefresh } from './jobs/sanctions-refresh';
import { ongoingScreening } from './jobs/ongoing-screening';
import { retentionSweep } from './jobs/retention-sweep';
import { auditExport } from './jobs/audit-export';
import { processMaturedLocks } from './jobs/process-matured-locks';
import { monthlyMaintenanceFee } from './jobs/monthly-maintenance-fee';
import { monthlyCardFee } from './jobs/monthly-card-fee';

interface Job {
  name: string;
  schedule: string;
  fn: () => Promise<void>;
}

const jobs: Job[] = [
  { name: 'session-cleanup',         schedule: '*/15 * * * *', fn: sessionCleanup },
  { name: 'sanctions-refresh',       schedule: '0 2 * * *',    fn: sanctionsRefresh },
  { name: 'ongoing-screening',       schedule: '0 3 * * *',    fn: ongoingScreening },
  { name: 'retention-sweep',         schedule: '0 4 * * *',    fn: retentionSweep },
  { name: 'audit-export',            schedule: '0 5 * * *',    fn: auditExport },
  { name: 'process-matured-locks',   schedule: '0 * * * *',    fn: processMaturedLocks },
  // Monthly account maintenance fee — 01:30 on the 1st of every month,
  // Africa/Lagos. Reads monthlyMaintenanceFeeUsdCents from platform_settings;
  // no-op when 0. Idempotent per user per month via Transaction.idempotencyKey.
  { name: 'monthly-maintenance-fee', schedule: '30 1 1 * *',   fn: monthlyMaintenanceFee },
  // Card monthly fee runs 15 min AFTER the user-level maintenance fee so
  // accounts get debited first and the card fee can use the trimmed
  // balance check correctly.
  { name: 'monthly-card-fee',        schedule: '45 1 1 * *',   fn: monthlyCardFee },
];

const env = process.env['NODE_ENV'] ?? 'development';
logger.info({ env, jobCount: jobs.length }, 'cron worker starting');

for (const job of jobs) {
  cron.schedule(
    job.schedule,
    async () => {
      const start = Date.now();
      try {
        logger.info({ job: job.name }, 'job starting');
        await job.fn();
        logger.info({ job: job.name, ms: Date.now() - start }, 'job complete');
      } catch (err) {
        logger.error(
          { job: job.name, ms: Date.now() - start, err: err instanceof Error ? err.message : err },
          'job failed',
        );
      }
    },
    { timezone: 'Africa/Lagos' },
  );
  logger.info({ job: job.name, schedule: job.schedule }, 'job registered');
}

// Graceful shutdown — PM2 sends SIGINT/SIGTERM on reload
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'cron worker shutting down');
  // Give in-flight jobs up to 25 s to finish before PM2's 30 s hard kill
  setTimeout(() => process.exit(0), 25_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Signal PM2 we're ready (required because ecosystem sets wait_ready for web)
if (process.send) process.send('ready');

// Keep the process alive without top-level await (which is incompatible with
// the createRequire shim build-worker.mjs injects — Node refuses ambiguous
// ESM-with-require syntax). A non-unref'd setInterval keeps the event loop
// open until the process is signalled. node-cron's own timers also hold it
// open, but this is belt-and-braces.
setInterval(() => { /* keepalive tick */ }, 60_000);
