/**
 * GET /api/transactions
 * Paginated list of the user's transactions (initiator or counterparty).
 * Query: ?page=1&limit=20&type=DEPOSIT|P2P|...&currency=USD
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const VALID_TYPES = new Set([
  'DEPOSIT', 'WITHDRAWAL', 'P2P', 'FX', 'FEE', 'REFUND', 'LOCK', 'UNLOCK',
  'CARD_AUTH', 'CARD_CAPTURE', 'CARD_REVERSAL',
]);

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  const { searchParams } = req.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10));
  const type = searchParams.get('type');
  const currency = searchParams.get('currency');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    OR: [
      { initiatorUserId: session.userId },
      { counterpartyUserId: session.userId },
    ],
  };
  if (type && VALID_TYPES.has(type)) where.type = type;
  if (currency) where.currency = currency;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        currency: true,
        feeAmount: true,
        feeCurrency: true,
        externalRef: true,
        metadata: true,
        createdAt: true,
        postedAt: true,
        initiatorUserId: true,
        counterpartyUserId: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transactions: transactions.map((t: any) => ({
      ...t,
      amount: t.amount.toString(),
      feeAmount: t.feeAmount.toString(),
      createdAt: t.createdAt.toISOString(),
      postedAt: t.postedAt?.toISOString() ?? null,
      direction:
        t.initiatorUserId === session.userId && t.counterpartyUserId === session.userId
          ? 'internal'
          : t.initiatorUserId === session.userId
            ? 'out'
            : 'in',
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
