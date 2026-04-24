// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/withdrawals — list the authenticated user's NGN withdrawals
 * POST /api/withdrawals — create a new NGN withdrawal request (pending admin review)
 *
 * Flow for POST:
 *   1. Validate T2+ KYC, user status
 *   2. Validate beneficiary belongs to user (and is past cooling period)
 *   3. Fetch current USD→NGN rate from Graph (or accept caller's rate_id)
 *   4. Apply fxMarkupBps and withdrawalFeePercent from platform settings
 *   5. Hold the USD in the user's AVAILABLE→HOLD ledger
 *   6. Create Transaction (type=WITHDRAWAL, status=PENDING) + Withdrawal row
 *   7. Return the withdrawal for confirmation — admin reviews + triggers payout
 *
 * No OTP today (first client MVP). Add OTP gate before raising the default
 * daily limit past $1k.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import { fetchGraphRate, isGraphConfigured } from '@frenzpay/providers/graph';
import {
  postTransaction,
  ensureAccount,
  balanceOf,
} from '@frenzpay/ledger';

// ── GET ────────────────────────────────────────────────────────────────────

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

// ── POST ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  beneficiaryId: z.string().uuid(),
  sourceAmountCents: z.number().int().positive().max(10_000_000_00),
  /** Optional Graph rate_id to lock in the quoted rate. */
  rate_id: z.string().optional(),
});

/** Read a platform setting with a typed default. */
async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row && row.value !== null && row.value !== undefined) {
      return row.value as T;
    }
  } catch { /* fall through */ }
  return fallback;
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // ── Eligibility ──────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, kycTier: true, status: true, graphPersonId: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }

  const kycRequired = await readSetting<boolean>('kycRequiredForWithdrawal', true);
  if (kycRequired && user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Complete KYC verification before withdrawing.' },
      { status: 403 },
    );
  }

  // ── Beneficiary ──────────────────────────────────────────────────────────
  const beneficiary = await prisma.beneficiary.findUnique({
    where: { id: parsed.data.beneficiaryId },
    select: {
      id: true,
      userId: true,
      type: true,
      isActive: true,
      bankCode: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      coolingPeriodEndsAt: true,
    },
  });
  if (!beneficiary || beneficiary.userId !== session.userId) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 });
  }
  if (!beneficiary.isActive || beneficiary.type !== 'bank_account') {
    return NextResponse.json({ error: 'Beneficiary is not active' }, { status: 409 });
  }
  if (!beneficiary.bankCode || !beneficiary.accountNumber) {
    return NextResponse.json(
      { error: 'Beneficiary is missing bank details.' },
      { status: 409 },
    );
  }
  if (beneficiary.coolingPeriodEndsAt && beneficiary.coolingPeriodEndsAt > new Date()) {
    const hours = Math.ceil(
      (beneficiary.coolingPeriodEndsAt.getTime() - Date.now()) / (60 * 60 * 1000),
    );
    return NextResponse.json(
      {
        error: `This beneficiary is in a cool-down period. Try again in ${hours} hour(s).`,
        coolingPeriodEndsAt: beneficiary.coolingPeriodEndsAt.toISOString(),
      },
      { status: 425 },
    );
  }

  // ── Limit checks ─────────────────────────────────────────────────────────
  const minUsd = await readSetting<number>('minWithdrawalUsd', 10);
  const minCents = Math.round(minUsd * 100);
  if (parsed.data.sourceAmountCents < minCents) {
    return NextResponse.json(
      { error: `Minimum withdrawal is $${minUsd}.` },
      { status: 422 },
    );
  }

  const dailyLimitUsd = await readSetting<number>('dailyWithdrawalLimitUsd', 50_000);
  const dailyLimitCents = Math.round(dailyLimitUsd * 100);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.withdrawal.aggregate({
    where: {
      transaction: { initiatorUserId: session.userId },
      createdAt: { gte: since24h },
      NOT: { status: { in: ['FAILED', 'REFUNDED'] } },
    },
    _sum: { sourceAmountCents: true },
  });
  const recentSum = Number(recent._sum.sourceAmountCents ?? 0n);
  if (recentSum + parsed.data.sourceAmountCents > dailyLimitCents) {
    return NextResponse.json(
      { error: `Daily withdrawal limit of $${dailyLimitUsd.toLocaleString()} would be exceeded.` },
      { status: 422 },
    );
  }

  // ── Balance check ────────────────────────────────────────────────────────
  const availableAccountId = await ensureAccount(prisma, session.userId, 'USD', 'AVAILABLE');
  const balance = await balanceOf(prisma, availableAccountId);
  if (balance < BigInt(parsed.data.sourceAmountCents)) {
    return NextResponse.json(
      {
        error: 'Insufficient USD balance.',
        availableCents: balance.toString(),
        requestedCents: String(parsed.data.sourceAmountCents),
      },
      { status: 422 },
    );
  }

  // ── Quote the FX ────────────────────────────────────────────────────────
  let rate = 0;
  if (isGraphConfigured()) {
    try {
      const graphRate = await fetchGraphRate('USD', 'NGN');
      rate = graphRate.rate;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[withdraw] rate fetch failed, using fallback',
      );
      rate = 1500; // fallback
    }
  } else {
    rate = 1500; // dev stub
  }

  const fxMarkupBps = await readSetting<number>('fxMarkupBps', 50);
  const withdrawalFeePct = await readSetting<number>('withdrawalFeePercent', 1.5);

  // effective rate applies markup against the user
  const effectiveRate = rate * (1 - fxMarkupBps / 10_000);
  // sourceAmountCents = USD cents. Convert to NGN kobo (100 kobo = 1 NGN).
  // USD cents × rate → NGN "cents equivalent" isn't right; the rate is USD→NGN
  // in units, so $1 (100 cents) at rate 1500 → 1500 NGN = 150000 kobo.
  // So kobo = cents × rate × (100 / 100) = cents × rate. That's because
  // cents÷100 → USD × rate → NGN × 100 → kobo. The 100s cancel.
  const destAmountKobo = Math.floor(
    parsed.data.sourceAmountCents * effectiveRate,
  );
  const feeCents = Math.floor(parsed.data.sourceAmountCents * (withdrawalFeePct / 100));
  const fxRateMicro = Math.floor(effectiveRate * 1_000_000);

  // ── Create Transaction + Withdrawal + Hold the funds ─────────────────────
  const holdAccountId = await ensureAccount(prisma, session.userId, 'USD', 'HOLD');
  const idempotencyKey = `withdraw-${session.userId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  try {
    const tx = await postTransaction(prisma, {
      type: 'WITHDRAWAL',
      idempotencyKey,
      initiatorUserId: session.userId,
      lines: [
        {
          debitAccountId: availableAccountId,
          creditAccountId: holdAccountId,
          amount: BigInt(parsed.data.sourceAmountCents),
        },
      ],
      feeAmount: BigInt(feeCents),
      metadata: {
        beneficiaryId: beneficiary.id,
        bankCode: beneficiary.bankCode,
        accountNumber: beneficiary.accountNumber,
        bankName: beneficiary.bankName,
        accountName: beneficiary.accountName,
        rateUsdNgn: rate,
        effectiveRateUsdNgn: effectiveRate,
        fxMarkupBps,
        withdrawalFeePercent: withdrawalFeePct,
      },
    });

    const withdrawal = await prisma.withdrawal.create({
      data: {
        transactionId: tx.id,
        beneficiaryId: beneficiary.id,
        sourceAmountCents: BigInt(parsed.data.sourceAmountCents),
        destAmountKobo: BigInt(destAmountKobo),
        fxRateMicro: BigInt(fxRateMicro),
        fxMarkupBps,
        feeCents: BigInt(feeCents),
        status: 'PENDING',
        provider: 'graph',
      },
      select: {
        id: true,
        status: true,
        sourceAmountCents: true,
        destAmountKobo: true,
        feeCents: true,
        fxRateMicro: true,
        createdAt: true,
      },
    });

    logger.info(
      {
        userId: session.userId,
        withdrawalId: withdrawal.id,
        sourceAmountCents: parsed.data.sourceAmountCents,
        destAmountKobo,
        rate,
      },
      'Withdrawal initiated',
    );

    return NextResponse.json(
      {
        withdrawal: {
          id: withdrawal.id,
          status: withdrawal.status,
          sourceAmountCents: withdrawal.sourceAmountCents.toString(),
          destAmountKobo: withdrawal.destAmountKobo.toString(),
          feeCents: withdrawal.feeCents.toString(),
          fxRateMicro: withdrawal.fxRateMicro.toString(),
          effectiveRate,
          fxMarkupBps,
          createdAt: withdrawal.createdAt.toISOString(),
        },
        message:
          'Withdrawal submitted. An admin will review it within 24h, then the payout releases to your bank.',
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId: session.userId, err: msg }, '[withdraw] creation failed');
    return NextResponse.json({ error: 'Could not create withdrawal' }, { status: 500 });
  }
}
