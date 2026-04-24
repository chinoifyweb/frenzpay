/**
 * GET /api/admin/withdrawals
 *
 * Admin endpoint: list NGN withdrawal requests for review.
 *
 * Query params:
 *   - status: PENDING_OTP | PENDING | PROCESSING | SETTLED | FAILED | REFUNDED | 'all' (default: all)
 *   - limit:  1..200 (default 100)
 *   - cursor: withdrawal.id to paginate from
 *
 * Returns NGN (Graph rail) withdrawals only. USDT / Bridge payouts live on the
 * separate admin.frenzpay.co surface.
 *
 * Shape includes joined user (via Transaction.initiator) and beneficiary bank
 * details so the admin table can render everything it needs in one payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const ALLOWED_STATUSES = new Set([
  'PENDING_OTP',
  'PENDING',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REFUNDED',
]);

/**
 * Convert BigInt + Date fields to JSON-safe primitives. Prisma hands us BigInts
 * for cents/kobo amounts; JSON.stringify blows up on those.
 */
function serialise<T extends Record<string, unknown>>(
  row: T,
): { [K in keyof T]: T[K] extends bigint ? string : T[K] extends Date | null ? string | null : T[K] } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') out[k] = v.toString();
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out as any;
}

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') ?? 'all';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 100), 1), 200);
  const cursor = searchParams.get('cursor') ?? undefined;

  const where =
    statusParam !== 'all' && ALLOWED_STATUSES.has(statusParam)
      ? { status: statusParam as any }
      : {};

  // One DB round trip: withdrawals + transaction + initiator user
  const rows = await prisma.withdrawal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      status: true,
      provider: true,
      sourceAmountCents: true,
      destAmountKobo: true,
      fxRateMicro: true,
      fxMarkupBps: true,
      feeCents: true,
      externalRef: true,
      failureReason: true,
      beneficiaryId: true,
      settledAt: true,
      createdAt: true,
      transaction: {
        select: {
          id: true,
          idempotencyKey: true,
          initiator: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              kycTier: true,
              status: true,
            },
          },
        },
      },
    },
  });

  // Join beneficiaries in a second round trip (Withdrawal has no FK relation
  // defined in the schema yet — avoids a migration for this hotfix).
  const beneficiaryIds = Array.from(new Set(rows.map((r: (typeof rows)[number]) => r.beneficiaryId)));
  type BeneficiaryRow = {
    id: string;
    bankName: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    accountName: string | null;
    currency: string | null;
  };
  const beneficiaries: BeneficiaryRow[] = beneficiaryIds.length
    ? ((await prisma.beneficiary.findMany({
        where: { id: { in: beneficiaryIds } },
        select: {
          id: true,
          bankName: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
          currency: true,
        },
      })) as BeneficiaryRow[])
    : [];
  const benMap = new Map<string, BeneficiaryRow>(beneficiaries.map((b) => [b.id, b]));

  const data = rows.map((r: (typeof rows)[number]) => {
    const ben = benMap.get(r.beneficiaryId) ?? null;
    const user = r.transaction.initiator;
    return {
      id: r.id,
      status: r.status,
      provider: r.provider,
      sourceAmountCents: r.sourceAmountCents.toString(),
      destAmountKobo: r.destAmountKobo.toString(),
      fxRateMicro: r.fxRateMicro.toString(),
      fxMarkupBps: r.fxMarkupBps,
      feeCents: r.feeCents.toString(),
      externalRef: r.externalRef,
      failureReason: r.failureReason,
      settledAt: r.settledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
            kycTier: user.kycTier,
            status: user.status,
          }
        : null,
      beneficiary: ben
        ? {
            bankName: ben.bankName,
            bankCode: ben.bankCode,
            accountNumber: ben.accountNumber,
            accountName: ben.accountName,
            currency: ben.currency,
          }
        : null,
    };
  });

  return NextResponse.json({
    withdrawals: data,
    pagination: {
      limit,
      hasMore: data.length === limit,
      nextCursor: data.length === limit ? data[data.length - 1].id : null,
    },
  });
}
