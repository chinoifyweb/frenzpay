/**
 * Job: monthly-card-fee
 * Schedule: 45 1 1 * *   (01:45 Africa/Lagos on the 1st of every month)
 *
 * Charges the configured monthly fee for every ACTIVE card on the
 * platform. The fee amount is read from `cardMonthlyFeeUsdCents`; when
 * 0 the job no-ops.
 *
 * For each active card:
 *   - Look up the owning user
 *   - If user.USD.AVAILABLE >= fee:
 *       debit user.USD.AVAILABLE
 *       credit fees_usd
 *       Transaction(type=FEE, idempotencyKey=`card-monthly-${cardId}-${YYYY-MM}`)
 *   - Else: skip (no negative balances) and try again next month
 *
 * Idempotency: Transaction.idempotencyKey is unique per (cardId, period),
 * so re-running the job is safe.
 *
 * Runs after the user-level monthly maintenance job (see schedule), so
 * card fees won't pre-empt account fees on a balance-tight user.
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

const LOCK_KEY = 'cron:monthly-card-fee';
const LOCK_TTL_SECONDS = 30 * 60;
const PAGE_SIZE = 200;

function yyyyMm(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function readFeeCents(): Promise<number> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: 'cardMonthlyFeeUsdCents' },
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

export async function monthlyCardFee(): Promise<void> {
  const lock = await redis.set(LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SECONDS, 'NX');
  if (lock !== 'OK') {
    logger.info({ job: 'monthly-card-fee' }, 'lock held; skipping');
    return;
  }

  try {
    const feeCents = await readFeeCents();
    if (feeCents <= 0) {
      logger.info({ feeCents }, 'cardMonthlyFeeUsdCents is 0 \u2014 job disabled, no-op');
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
        'fees_usd system account missing \u2014 aborting card-fee run',
      );
      return;
    }

    let cursor: string | undefined;
    let charged = 0;
    let skippedInsufficient = 0;
    let skippedAlreadyCharged = 0;
    let skippedInactiveUser = 0;
    let errors = 0;

    for (;;) {
      const batch = await prisma.card.findMany({
        where: {
          status: 'ACTIVE',
        },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          externalCardId: true,
          userId: true,
          user: { select: { status: true, deletedAt: true } },
        },
      });
      if (batch.length === 0) break;

      for (const card of batch) {
        // Skip cards owned by suspended/deleted users — we don't take fees
        // from accounts that can't transact.
        if (card.user.status !== 'ACTIVE' || card.user.deletedAt) {
          skippedInactiveUser++;
          continue;
        }

        const idempotencyKey = `card-monthly-${card.id}-${period}`;
        try {
          const existing = await prisma.transaction.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          });
          if (existing) {
            skippedAlreadyCharged++;
            continue;
          }

          const availableAccountId = await ensureAccount(
            prisma,
            card.userId,
            'USD',
            'AVAILABLE',
          );
          const balance = await balanceOf(prisma, availableAccountId);
          if (balance < BigInt(feeCents)) {
            skippedInsufficient++;
            continue;
          }

          await prisma.$transaction(async (tx: any) => {
            await postTransaction(tx, {
              type: 'FEE',
              idempotencyKey,
              initiatorUserId: card.userId,
              lines: [
                {
                  debitAccountId: availableAccountId,
                  creditAccountId: feesAccountId,
                  amount: BigInt(feeCents),
                },
              ],
              metadata: {
                kind: 'card_monthly',
                cardId: card.id,
                externalCardId: card.externalCardId,
                period,
                feeCents,
              },
            });
            await tx.auditLog.create({
              data: {
                userId: card.userId,
                action: 'CARD_MONTHLY_FEE_CHARGED',
                resourceType: 'Card',
                resourceId: card.id,
                metadata: { period, feeCents, externalCardId: card.externalCardId },
              },
            });
          });
          charged++;
        } catch (err) {
          errors++;
          logger.error(
            {
              cardId: card.id,
              userId: card.userId,
              err: err instanceof Error ? err.message : err,
              period,
            },
            'monthly card fee charge failed',
          );
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < PAGE_SIZE) break;
    }

    logger.info(
      {
        period,
        feeCents,
        charged,
        skippedInsufficient,
        skippedAlreadyCharged,
        skippedInactiveUser,
        errors,
      },
      'monthly card fee run complete',
    );
  } finally {
    try { await redis.del(LOCK_KEY); } catch { /* non-fatal */ }
  }
}
