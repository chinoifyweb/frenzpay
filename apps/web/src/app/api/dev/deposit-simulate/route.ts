/**
 * POST /api/dev/deposit-simulate
 * DEV + ADMIN only. Credits a user's AVAILABLE account from external_world.
 *
 * Body: { userId: string, currency: "USD"|"NGN"|"USDC", amountCents: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { ensureAccount, getSystemAccount, postTransaction, Money } from '@frenzpay/ledger';
import { randomBytes } from 'node:crypto';

const Schema = z.object({
  userId: z.string().uuid(),
  currency: z.enum(['USD', 'NGN', 'USDC']),
  amountCents: z.string().regex(/^[0-9]+$/, 'amountCents must be a positive integer string'),
});

export async function POST(req: NextRequest) {
  if (process.env['NODE_ENV'] === 'production') {
    return NextResponse.json({ error: 'Not available in production.' }, { status: 403 });
  }

  const { session } = await requireSession();

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { userId, currency, amountCents } = parsed.data;
  const amount = BigInt(amountCents);
  if (amount <= 0n) {
    return NextResponse.json({ error: 'amountCents must be positive' }, { status: 422 });
  }

  const recipient = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, kycTier: true },
  });
  if (!recipient) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const userAccountId = await ensureAccount(prisma, userId, currency, 'AVAILABLE');
  const externalAccountName =
    currency === 'USD' ? 'external_world_usd'
    : currency === 'NGN' ? 'external_world_ngn'
    : 'external_world_usdc';
  const externalAccountId = await getSystemAccount(prisma, externalAccountName);

  const result = await postTransaction(prisma, {
    type: 'DEPOSIT',
    idempotencyKey: `sim-${randomBytes(16).toString('hex')}`,
    lines: [{
      debitAccountId: externalAccountId,
      creditAccountId: userAccountId,
      amount: Money.of(amount, currency),
    }],
    initiatorUserId: userId,
    metadata: { simulated: true, credited_by_admin: session.userId },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'DEV_DEPOSIT_SIMULATED',
      resourceType: 'Transaction',
      resourceId: result.id,
      metadata: { targetUserId: userId, currency, amountCents },
    },
  });

  return NextResponse.json({
    transactionId: result.id,
    status: result.status,
    message: `Credited ${amountCents} ${currency} minor units to user ${userId}.`,
  });
}
