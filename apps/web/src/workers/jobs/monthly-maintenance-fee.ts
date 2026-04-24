/**
 * Job: monthly-maintenance-fee
 * Schedule: 30 1 1 * *   (01:30 Africa/Lagos on the 1st of every month)
 *
 * Charges an automatic maintenance fee to every KYC-verified (T2+) active
 * user on the 1st of each month. The fee amount is read from the
 * `monthlyMaintenanceFeeUsdCents` platform setting — when 0 the job no-ops.
 *
 * Each charge:
 *   - Debits user.USD.AVAILABLE by the fee
 *   - Credits fees_usd (system account)
 *   - Records a FEE Transaction with idempotencyKey `maint-<userId>-<YYYY-MM>`
 *     so a re-run of the cron can't double-charge
 *   - Writes an audit_logs entry with action=MONTHLY_MAINTENANCE_CHARGED
 *
 * Skipped (not charged) when:
 *   - User balance < fee (we don't go negative; retried next month)
 *   - User already charged for the current month
 *   - User is SUSPENDED or DELETED
 *
 * Safety:
 *   - Wrapped in a Redis `SET NX EX` lock so if multiple workers exist only
 *     one runs at a time.
 *   - Batches through users in pages of 200 to keep memory + DB steady.
 *   - Each user's charge is its own Prisma transaction; one failure doesn't
 *     stop the batch.
 */

import { prisma } from '@frenzpay/db';
import { redis } from '@/lib/redis';
import {
  ensureAccount,
  getSystemAccount,
  postTransaction,
  balanceOf,
} from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

const LOCK_KEY = 'cron:monthly-maintenance-fee';
const LOCK_TTL_SECONDS = 30 * 60; // 30 min — generous for slow DB
const PAGE_SIZE = 200;

function yyyyMm(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function readFeeCents(): Promise<number> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: 'monthlyMaintenanceFeeUsdCents' },
      select: { value: true },
    });
    if (!row) return 0;
    if (typeof row.value === 'number') return row.value;
    if (typeof row.value === 'string') return Number(row.value) || 0;
    return 0;
  } catch {
    return 0;
  }
}

export async function monthlyMaintenanceFee(): Promise<void> {
  // Global lock — first worker wins for this run
  const lock = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SECONDS, 'NX');
  if (lock !== 'OK') {
    logger.info({ job: 'monthly-maintenance-fee' }, 'lock held; skipping');
    return;
  }

  try {
    const feeCents = await readFeeCents();
    if (feeCents <= 0) {
      logger.info(
        { feeCents },
        'monthlyMaintenanceFeeUsdCents is 0 \u2014 job disabled, no-op',
      );
      return;
    }

    const now = new Date();
    const period = yyyyMm(now);

    let feesAccountId: string;
    try {
      feesAccountId = await getSystemAccount(prisma, 'fees_usd');
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : err },
        'fees_usd system account missing \u2014 aborting run',
      );
      return;
    }

    let cursor: string | undefined;
    let charged = 0;
    let skippedInsufficient = 0;
    let skippedAlreadyCharged = 0;
    let errors = 0;

    for (;;) {
      const batch = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          kycTier: { in: ['T2', 'T3'] },
          deletedAt: null,
        },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, email: true },
      });
      if (batch.length === 0) break;

      for (const user of batch) {
        const idempotencyKey = `maint-${user.id}-${period}`;
        try {
          // Check if already charged for this period
          const existing = await prisma.transaction.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          });
          if (existing) {
            skippedAlreadyCharged++;
            continue;
          }

          // Ensure user has a USD AVAILABLE account — if they've never
          // transacted there won't be one. Create-if-missing.
          const availableAccountId = await ensureAccount(prisma, user.id, 'USD', 'AVAILABLE');
          const balance = await balanceOf(prisma, availableAccountId);
          if (balance < BigInt(feeCents)) {
            skippedInsufficient++;
            continue;
          }

          await prisma.$transaction(async (tx: any) => {
            await postTransaction(tx, {
              type: 'FEE',
              idempotencyKey,
              initiatorUserId: user.id,
              lines: [
                {
                  debitAccountId: availableAccountId,
                  creditAccountId: feesAccountId,
                  amount: BigInt(feeCents),
                },
              ],
              metadata: {
                kind: 'maintenance',
                period,
                feeCents,
              },
            });
            await tx.auditLog.create({
              data: {
                userId: user.id,
                action: 'MONTHLY_MAINTENANCE_CHARGED',
                resourceType: 'User',
                resourceId: user.id,
                metadata: { period, feeCents },
              },
            });
          });
          charged++;
        } catch (err) {
          errors++;
          logger.error(
            {
              userId: user.id,
              err: err instanceof Error ? err.message : err,
              period,
            },
            'monthly maintenance charge failed for user',
          );
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < PAGE_SIZE) break;
    }

    logger.info(
      { period, feeCents, charged, skippedInsufficient, skippedAlreadyCharged, errors },
      'monthly maintenance fee run complete',
    );
  } finally {
    try { await redis.del(LOCK_KEY); } catch { /* non-fatal */ }
  }
}
