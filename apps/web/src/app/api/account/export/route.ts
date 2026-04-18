/**
 * GET /api/account/export
 * GDPR / data-portability — the authenticated user downloads their own data
 * as a single JSON blob. Includes profile, transactions, p2p, withdrawals,
 * savings locks, cards (metadata only — no PAN/CVV), audit log.
 *
 * Rate-limited: 2 exports per hour per user.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { checkRateLimit } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';

export async function GET() {
  const { session } = await requireSession();

  const rl = await checkRateLimit(redis, `rl:export:user:${session.userId}`, 2, 3_600_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'You can export your data 2 times per hour.' },
      { status: 429 },
    );
  }

  const [user, transactions, p2p, withdrawals, locks, cards, auditLogs, payments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        kycTier: true, kycStatus: true, status: true,
        createdAt: true, updatedAt: true,
        frenzTag: { select: { tag: true, claimedAt: true, isVerified: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { OR: [{ initiatorUserId: session.userId }, { counterpartyUserId: session.userId }] },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, type: true, status: true, amount: true, currency: true,
        feeAmount: true, externalRef: true, createdAt: true, postedAt: true,
      },
    }),
    prisma.p2PTransfer.findMany({
      where: { OR: [{ senderId: session.userId }, { recipientId: session.userId }] },
      select: { id: true, senderId: true, recipientId: true, note: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { transaction: { initiatorUserId: session.userId } },
      select: {
        id: true, sourceAmountCents: true, destAmountKobo: true, feeCents: true,
        status: true, provider: true, externalRef: true, settledAt: true, createdAt: true,
      },
    }),
    prisma.savingsLock.findMany({
      where: { userId: session.userId },
      select: {
        id: true, amountCents: true, currency: true, goalName: true,
        status: true, maturityAt: true, unlockedAt: true, createdAt: true,
      },
    }),
    prisma.card.findMany({
      where: { userId: session.userId },
      select: {
        id: true, last4: true, brand: true, expiryMonth: true, expiryYear: true,
        status: true, dailyLimitCents: true, monthlyLimitCents: true, createdAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, action: true, resourceType: true, resourceId: true, metadata: true, createdAt: true },
      take: 5000,
    }),
    prisma.paymentLink.findMany({
      where: { userId: session.userId },
      select: {
        id: true, slug: true, type: true, currency: true, description: true,
        status: true, viewCount: true, createdAt: true,
      },
    }),
  ]);

  // BigInt -> string, Date -> ISO
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalize = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(normalize);
    if (typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, normalize(v)]));
    }
    return obj;
  };

  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: 'DATA_EXPORT',
      resourceType: 'User', resourceId: session.userId,
    },
  });

  const payload = normalize({
    exportedAt: new Date(),
    user,
    transactions,
    p2pTransfers: p2p,
    withdrawals,
    savingsLocks: locks,
    cards,
    paymentLinks: payments,
    auditLog: auditLogs,
    note: 'This file contains all personal data FrenzPay holds about you. Store securely.',
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="frenzpay-export-${session.userId.slice(0, 8)}.json"`,
    },
  });
}
