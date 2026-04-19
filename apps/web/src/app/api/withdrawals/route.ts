/**
 * GET /api/withdrawals
 * List the authenticated user's withdrawals with pagination.
 *
 * NB: This is a read-only listing. The NGN payout initiator has been removed
 * alongside the Paystack client; a replacement rail (Bridge NGN or Yellow Card)
 * needs to be wired up before users can initiate new NGN withdrawals.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  const { searchParams } = req.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  const [withdrawals, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where: { transaction: { initiatorUserId: session.userId } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        sourceAmountCents: true,
        destAmountKobo: true,
        feeCents: true,
        fxRateMicro: true,
        fxMarkupBps: true,
        status: true,
        provider: true,
        externalRef: true,
        failureReason: true,
        settledAt: true,
        createdAt: true,
        transaction: {
          select: { currency: true, metadata: true },
        },
      },
    }),
    prisma.withdrawal.count({
      where: { transaction: { initiatorUserId: session.userId } },
    }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withdrawals: withdrawals.map((w: any) => ({
      id: w.id,
      sourceAmountCents: w.sourceAmountCents.toString(),
      destAmountKobo: w.destAmountKobo.toString(),
      feeCents: w.feeCents.toString(),
      fxRateMicro: w.fxRateMicro.toString(),
      fxMarkupBps: w.fxMarkupBps,
      status: w.status,
      provider: w.provider,
      reference: w.externalRef,
      failureReason: w.failureReason,
      settledAt: w.settledAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
      sourceCurrency: w.transaction.currency,
      metadata: w.transaction.metadata,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
