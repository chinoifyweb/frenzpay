/**
 * GET  /api/savings       — list the user's savings locks
 * POST /api/savings       — create a new lock (debit AVAILABLE, credit LOCKED)
 *
 * Lock durations: 30, 90, 180, 365 days. Early-break fee: 2% (configurable per lock).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { ensureAccount, availableBalanceOf, postTransaction, Money } from '@frenzpay/ledger';
import { randomBytes } from 'node:crypto';

const VALID_DURATIONS_DAYS = new Set([30, 90, 180, 365]);

const CreateSchema = z.object({
  amountMinor: z.string().regex(/^[1-9][0-9]*$/),
  currency: z.enum(['USD', 'USDC', 'NGN']),
  durationDays: z.number().int().refine((d) => VALID_DURATIONS_DAYS.has(d), 'Invalid lock duration'),
  goalName: z.string().min(1).max(80).optional(),
  pin: z.string().regex(/^\d{6}$/),
});

export async function GET() {
  const { session } = await requireSession();

  const locks = await prisma.savingsLock.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, amountCents: true, currency: true, goalName: true,
      status: true, maturityAt: true, earlyBreakFeeBps: true,
      unlockedAt: true, createdAt: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ locks: locks.map((l: any) => ({
    ...l,
    amountCents: l.amountCents.toString(),
    maturityAt: l.maturityAt.toISOString(),
    unlockedAt: l.unlockedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
  })) });
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const pinResult = await verifyUserPin(session.userId, parsed.data.pin);
  if (!pinResult.ok) return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });

  const user = await prisma.user.findUnique({
    where: { id: session.userId }, select: { kycTier: true, status: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') return NextResponse.json({ error: 'Account not active.' }, { status: 403 });
  if (user.kycTier === 'T0') return NextResponse.json({ error: 'Complete KYC first.' }, { status: 403 });

  const amount = BigInt(parsed.data.amountMinor);
  const { amountMinor: _amountMinor, currency, durationDays, goalName } = parsed.data;

  // Balance check
  const balance = await availableBalanceOf(prisma, session.userId, currency);
  if (balance < amount) {
    return NextResponse.json(
      { error: `Insufficient ${currency} balance.`, available: balance.toString() },
      { status: 402 },
    );
  }

  const availableId = await ensureAccount(prisma, session.userId, currency, 'AVAILABLE');
  const lockedId = await ensureAccount(prisma, session.userId, currency, 'LOCKED');

  const maturityAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const idempotencyKey = `lock-${randomBytes(12).toString('hex')}`;

  // Atomic: ledger post + SavingsLock row
  const result = await prisma.$transaction(async (tx: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaTx = tx as any;

    // Post lock transaction inline (can't use postTransaction helper since we need the tx to share)
    const transaction = await prismaTx.transaction.create({
      data: {
        type: 'LOCK',
        status: 'POSTED',
        idempotencyKey,
        initiatorUserId: session.userId,
        amount,
        currency,
        metadata: { durationDays, goalName: goalName ?? null, maturityAt: maturityAt.toISOString() },
        postedAt: new Date(),
      },
    });

    await prismaTx.ledgerEntry.createMany({
      data: [{
        transactionId: transaction.id,
        debitAccountId: availableId,
        creditAccountId: lockedId,
        amount,
        currency,
      }],
    });

    const lock = await prismaTx.savingsLock.create({
      data: {
        userId: session.userId,
        lockTransactionId: transaction.id,
        amountCents: amount,
        currency,
        goalName: goalName ?? null,
        status: 'ACTIVE',
        maturityAt,
        earlyBreakFeeBps: 200,
      },
    });

    await prismaTx.auditLog.create({
      data: {
        userId: session.userId, action: 'SAVINGS_LOCKED',
        resourceType: 'SavingsLock', resourceId: lock.id,
        metadata: { amountMinor: amount.toString(), currency, durationDays, maturityAt: maturityAt.toISOString() },
      },
    });

    return { lock, transaction };
  });

  return NextResponse.json({
    lock: {
      id: result.lock.id,
      amountMinor: result.lock.amountCents.toString(),
      currency,
      goalName: result.lock.goalName,
      maturityAt: result.lock.maturityAt.toISOString(),
      status: 'ACTIVE',
    },
  }, { status: 201 });
}
