/**
 * POST /api/cron/process-matured-locks
 * Cron-triggered handler — processes savings locks that have reached maturity.
 *
 * Security: requires `CRON_SECRET` in the `x-cron-secret` header.
 * Invoked hourly by Netlify Scheduled Functions / Vercel Cron / similar.
 *
 * For each matured ACTIVE lock:
 *   - Post UNLOCK ledger transaction (LOCKED -> AVAILABLE, zero fee)
 *   - Update SavingsLock status = MATURED + unlockedAt + unlockTransactionId
 *   - Write AuditLog
 *
 * Idempotent via per-lock idempotency keys (`unlock-{lockId}`). Safe to run on
 * every tick; locks already unlocked are skipped by the `status: ACTIVE` filter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { ensureAccount, postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env['CRON_SECRET'];

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const matured = await prisma.savingsLock.findMany({
    where: { status: 'ACTIVE', maturityAt: { lte: now } },
    select: { id: true, userId: true, amountCents: true, currency: true },
    take: 500, // cap per tick
  });

  let processed = 0;
  const errors: Array<{ lockId: string; error: string }> = [];

  for (const lock of matured) {
    try {
      const amount = lock.amountCents as unknown as bigint;
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
        data: {
          status: 'MATURED',
          unlockedAt: now,
          unlockTransactionId: unlockTx.id,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: lock.userId, action: 'SAVINGS_MATURED_AUTO',
          resourceType: 'SavingsLock', resourceId: lock.id,
          metadata: { amountMinor: amount.toString(), currency: lock.currency },
        },
      });

      processed++;
    } catch (err) {
      errors.push({ lockId: lock.id, error: err instanceof Error ? err.message : String(err) });
      logger.error({ lockId: lock.id, err }, 'Failed to auto-mature savings lock');
    }
  }

  logger.info({ processed, errors: errors.length, total: matured.length }, 'Matured-locks cron tick');

  return NextResponse.json({ processed, errors, total: matured.length });
}
