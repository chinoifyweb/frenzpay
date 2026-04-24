// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/transactions
 *
 * Admin endpoint: list every Transaction on the platform, newest first.
 *
 * Query params:
 *   - status: PENDING | POSTED | FAILED | REVERSED | 'all' (default all)
 *   - type:   DEPOSIT | WITHDRAWAL | P2P_TRANSFER | FEE | ... | 'all' (default all)
 *   - currency: USD | NGN | EUR | GBP | 'all'
 *   - userId: filter to a single user (matches initiator OR counterparty)
 *   - limit:  1..200 (default 100)
 *   - cursor: transaction.id to paginate from
 *
 * Transactions are immutable financial records — this endpoint is read-only.
 * A "reverse" action is handled by creating a new reversing Transaction, not
 * by editing an existing row. The dashboard is strictly a view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const ALLOWED_STATUSES = new Set(['PENDING', 'POSTED', 'FAILED', 'REVERSED']);
// Must stay in sync with the TransactionType enum in schema.prisma
const ALLOWED_TYPES = new Set([
  'DEPOSIT',
  'WITHDRAWAL',
  'P2P',
  'FX',
  'FEE',
  'REFUND',
  'LOCK',
  'UNLOCK',
  'CARD_AUTH',
  'CARD_CAPTURE',
  'CARD_REVERSAL',
]);

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'all';
  const type = searchParams.get('type') ?? 'all';
  const currency = searchParams.get('currency') ?? 'all';
  const userId = searchParams.get('userId') ?? undefined;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 100), 1), 200);
  const cursor = searchParams.get('cursor') ?? undefined;

  const where: Record<string, unknown> = {};
  if (status !== 'all' && ALLOWED_STATUSES.has(status)) where.status = status;
  if (type !== 'all' && ALLOWED_TYPES.has(type)) where.type = type;
  if (currency !== 'all') where.currency = currency;
  if (userId) {
    where.OR = [{ initiatorUserId: userId }, { counterpartyUserId: userId }];
  }

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      type: true,
      status: true,
      amount: true,
      currency: true,
      feeAmount: true,
      feeCurrency: true,
      externalRef: true,
      idempotencyKey: true,
      createdAt: true,
      postedAt: true,
      initiator: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      counterparty: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  const data = rows.map((r: (typeof rows)[number]) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    amount: r.amount.toString(),
    currency: r.currency,
    feeAmount: r.feeAmount.toString(),
    feeCurrency: r.feeCurrency,
    externalRef: r.externalRef,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt.toISOString(),
    postedAt: r.postedAt?.toISOString() ?? null,
    initiator: r.initiator
      ? {
          id: r.initiator.id,
          email: r.initiator.email,
          name:
            `${r.initiator.firstName ?? ''} ${r.initiator.lastName ?? ''}`.trim() ||
            r.initiator.email,
        }
      : null,
    counterparty: r.counterparty
      ? {
          id: r.counterparty.id,
          email: r.counterparty.email,
          name:
            `${r.counterparty.firstName ?? ''} ${r.counterparty.lastName ?? ''}`.trim() ||
            r.counterparty.email,
        }
      : null,
  }));

  return NextResponse.json({
    transactions: data,
    pagination: {
      limit,
      hasMore: data.length === limit,
      nextCursor: data.length === limit ? data[data.length - 1].id : null,
    },
  });
}
