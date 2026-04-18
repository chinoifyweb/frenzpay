/**
 * POST   /api/savings/[id] — unlock early with fee (body: { pin })
 * Matured locks unlock automatically via the cron worker at /api/cron/process-matured-locks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { ensureAccount, getSystemAccount, postTransaction, Money } from '@frenzpay/ledger';

const Schema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireSession();
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'PIN required' }, { status: 422 });

  const pinResult = await verifyUserPin(session.userId, parsed.data.pin);
  if (!pinResult.ok) return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });

  const lock = await prisma.savingsLock.findFirst({
    where: { id, userId: session.userId },
    select: {
      id: true, amountCents: true, currency: true, status: true,
      maturityAt: true, earlyBreakFeeBps: true,
    },
  });

  if (!lock) return NextResponse.json({ error: 'Lock not found' }, { status: 404 });
  if (lock.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Lock is not active.' }, { status: 409 });
  }

  const isMatured = lock.maturityAt <= new Date();
  const amount = lock.amountCents as unknown as bigint;
  const feeMinor = isMatured ? 0n : (amount * BigInt(lock.earlyBreakFeeBps)) / 10_000n;
  const netToUser = amount - feeMinor;

  const availableId = await ensureAccount(prisma, session.userId, lock.currency, 'AVAILABLE');
  const lockedId = await ensureAccount(prisma, session.userId, lock.currency, 'LOCKED');
  const feesId = await getSystemAccount(prisma, lock.currency === 'NGN' ? 'fees_ngn' : 'fees_usd');

  const unlockLines = [
    // Net back to user
    { debitAccountId: lockedId, creditAccountId: availableId, amount: Money.of(netToUser, lock.currency) },
  ];
  if (feeMinor > 0n) {
    unlockLines.push({
      debitAccountId: lockedId, creditAccountId: feesId, amount: Money.of(feeMinor, lock.currency),
    });
  }

  const unlockTx = await postTransaction(prisma, {
    type: 'UNLOCK',
    idempotencyKey: `unlock-${lock.id}`,
    lines: unlockLines,
    initiatorUserId: session.userId,
    metadata: { lockId: lock.id, earlyBreak: !isMatured, feeMinor: feeMinor.toString() },
  });

  await prisma.savingsLock.update({
    where: { id: lock.id },
    data: {
      status: isMatured ? 'MATURED' : 'BROKEN_EARLY',
      unlockedAt: new Date(),
      unlockTransactionId: unlockTx.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: isMatured ? 'SAVINGS_MATURED_MANUAL' : 'SAVINGS_BROKEN_EARLY',
      resourceType: 'SavingsLock', resourceId: lock.id,
      metadata: { netToUserMinor: netToUser.toString(), feeMinor: feeMinor.toString() },
    },
  });

  return NextResponse.json({
    unlocked: true, matured: isMatured,
    netToUserMinor: netToUser.toString(),
    feeMinor: feeMinor.toString(),
    currency: lock.currency,
  });
}
