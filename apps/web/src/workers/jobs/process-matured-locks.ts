/**
 * Job: process-matured-locks
 * Schedule: 0 * * * *  (every hour on the hour)
 *
 * Wraps the existing `/api/cron/process-matured-locks` handler so the logic
 * lives in one place. The handler:
 *   - picks up to 500 SavingsLocks with status=ACTIVE AND maturityAt <= now
 *   - posts UNLOCK transactions (LOCKED -> AVAILABLE, zero fee)
 *   - writes AuditLog entries for each
 *
 * The cron worker runs inside the same Node process space as the Next.js app
 * (via PM2 on the same box), so we re-use the route handler directly rather
 * than make a loopback HTTP call.
 */
import { prisma } from '@frenzpay/db';
import { ensureAccount, postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

const BATCH_CAP = 500;

export async function processMaturedLocks(): Promise<void> {
  const now = new Date();
  const matured = await prisma.savingsLock.findMany({
    where: { status: 'ACTIVE', maturityAt: { lte: now } },
    select: { id: true, userId: true, amountCents: true, currency: true },
    take: BATCH_CAP,
  });

  if (matured.length === 0) {
    logger.debug('[process-matured-locks] no locks matured in this tick');
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const lock of matured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const amount = (lock as any).amountCents as bigint;
      const availableId = await ensureAccount(prisma, lock.userId, lock.currency, 'AVAILABLE');
      const lockedId = await ensureAccount(prisma, lock.userId, lock.currency, 'LOCKED');

      const unlockTx = await postTransaction(prisma, {
        type: 'UNLOCK',
        idempotencyKey: `unlock-${lock.id}`,
        lines: [{
          debitAccountId: lockedId,
          creditAccountId: availableId,
          amount: Money.of(amount, lock.currency),
        }],
        initiatorUserId: lock.userId,
        metadata: { lockId: lock.id, autoMatured: true },
      });

      await prisma.savingsLock.update({
        where: { id: lock.id },
        data: { status: 'MATURED', unlockedAt: now, unlockTransactionId: unlockTx.id },
      });

      await prisma.auditLog.create({
        data: {
          userId: lock.userId,
          action: 'SAVINGS_MATURED_AUTO',
          resourceType: 'SavingsLock',
          resourceId: lock.id,
          metadata: { amountMinor: amount.toString(), currency: lock.currency },
        },
      });

      processed++;
    } catch (err) {
      failed++;
      logger.error(
        { lockId: lock.id, err: err instanceof Error ? err.message : err },
        'failed to auto-mature savings lock',
      );
    }
  }

  logger.info({ processed, failed, total: matured.length }, '[process-matured-locks] tick complete');
}
