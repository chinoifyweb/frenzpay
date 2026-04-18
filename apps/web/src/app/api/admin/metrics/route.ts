/**
 * GET /api/admin/metrics — top-line platform metrics for the admin dashboard.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET() {
  await requireRole('admin');

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    usersTotal, usersActive, usersT1Plus, usersPendingKyc,
    txToday, txMonth, cardsActive, locksActive,
    kycPending, flagsOpen,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { kycTier: { in: ['T1', 'T2', 'T3'] } } }),
    prisma.user.count({ where: { kycStatus: 'PENDING_REVIEW' } }),
    prisma.transaction.count({ where: { createdAt: { gte: startOfDay }, status: 'POSTED' } }),
    prisma.transaction.count({ where: { createdAt: { gte: startOfMonth }, status: 'POSTED' } }),
    prisma.card.count({ where: { status: 'ACTIVE' } }),
    prisma.savingsLock.count({ where: { status: 'ACTIVE' } }),
    prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
    prisma.auditLog.count({ where: { action: { startsWith: 'FRAUD_' }, createdAt: { gte: startOfDay } } }).catch(() => 0),
  ]);

  // Platform revenue — sum of fees_usd + fees_ngn + fx_markup_usd credits this month
  const feeAccounts = await prisma.account.findMany({
    where: { ownerType: 'SYSTEM', name: { in: ['fees_usd', 'fees_ngn', 'fx_markup_usd'] } },
    select: { id: true, name: true, currency: true },
  });

  const revenueByAccount = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    feeAccounts.map(async (a: any) => {
      const { _sum } = await prisma.ledgerEntry.aggregate({
        where: { creditAccountId: a.id, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      });
      return {
        name: a.name,
        currency: a.currency,
        creditedMinor: ((_sum.amount as bigint | null) ?? 0n).toString(),
      };
    }),
  );

  return NextResponse.json({
    users: { total: usersTotal, active: usersActive, kyced: usersT1Plus, pendingKyc: usersPendingKyc },
    transactions: { today: txToday, thisMonth: txMonth },
    cards: { active: cardsActive },
    savings: { activeLocks: locksActive },
    queue: { pendingKyc: kycPending, fraudFlags24h: flagsOpen },
    revenueMtd: revenueByAccount,
  });
}
