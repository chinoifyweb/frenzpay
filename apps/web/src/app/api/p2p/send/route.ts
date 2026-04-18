/**
 * POST /api/p2p/send
 * Transfer money from the authenticated user to another user via their FrenzTag.
 *
 * Body:
 *   recipientTag   — 6-8 char FrenzTag
 *   amountMinor    — BigInt string in minor units (e.g. "50000" = $500.00)
 *   currency       — "USD" | "NGN" | "USDC"
 *   pin            — 6-digit transaction PIN (step-up auth)
 *   note?          — optional free-text note (max 200 chars)
 *   idempotencyKey — client-supplied UUID for safe retries
 *
 * Checks (in order):
 * 1. Auth + valid body
 * 2. PIN verification (locks after 5 failures)
 * 3. Recipient exists, is ACTIVE, is not the sender
 * 4. Sender + recipient both T1+ (basic KYC)
 * 5. Sender has sufficient AVAILABLE balance in the requested currency
 * 6. Daily P2P send limit (from KycTierLimit)
 *
 * On success: atomic Transaction + LedgerEntries + P2PTransfer row
 *   debit:  sender.<currency>.AVAILABLE
 *   credit: recipient.<currency>.AVAILABLE
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { assessRisk } from '@/lib/fraud';
import { ensureAccount, availableBalanceOf, postTransaction, Money } from '@frenzpay/ledger';
import { validateFrenzTag } from '@frenzpay/kyc';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  recipientTag: z.string().min(6).max(8),
  amountMinor: z.string().regex(/^[1-9][0-9]*$/, 'amountMinor must be a positive integer string'),
  currency: z.enum(['USD', 'NGN', 'USDC']),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
  note: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID'),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  // ── Parse body ─────────────────────────────────────────────────────────────
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

  const { recipientTag, amountMinor, currency, pin, note, idempotencyKey } = parsed.data;
  const amount = BigInt(amountMinor);
  const tag = recipientTag.toLowerCase().trim();

  const tagValid = validateFrenzTag(tag);
  if (!tagValid.valid) {
    return NextResponse.json({ error: tagValid.error }, { status: 422 });
  }

  // ── Idempotency: if we've seen this key, return the existing transfer ──────
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      status: true,
      p2pTransfer: {
        select: { id: true, recipientId: true, note: true },
      },
    },
  });

  if (existing) {
    return NextResponse.json({
      transactionId: existing.id,
      status: existing.status,
      idempotent: true,
      p2pTransferId: existing.p2pTransfer?.id ?? null,
    });
  }

  // ── PIN verification (step-up auth) ────────────────────────────────────────
  const pinResult = await verifyUserPin(session.userId, pin);
  if (!pinResult.ok) {
    return NextResponse.json(
      { error: pinResult.error, attemptsRemaining: pinResult.attemptsRemaining },
      { status: pinResult.status },
    );
  }

  // ── Load sender ────────────────────────────────────────────────────────────
  const sender = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, kycTier: true, status: true, firstName: true },
  });

  if (!sender) return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
  if (sender.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }
  if (sender.kycTier === 'T0') {
    return NextResponse.json({ error: 'Complete KYC (T1+) before sending money.' }, { status: 403 });
  }

  // ── Lookup recipient ───────────────────────────────────────────────────────
  const recipientFrenz = await prisma.frenzTag.findUnique({
    where: { tag },
    select: {
      tag: true,
      user: {
        select: { id: true, kycTier: true, status: true, firstName: true, lastName: true },
      },
    },
  });

  if (!recipientFrenz) {
    return NextResponse.json({ error: `No user found with FrenzTag @${tag}.` }, { status: 404 });
  }
  if (recipientFrenz.user.id === session.userId) {
    return NextResponse.json({ error: 'You cannot send money to yourself.' }, { status: 409 });
  }
  if (recipientFrenz.user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Recipient account is unavailable.' }, { status: 410 });
  }
  if (recipientFrenz.user.kycTier === 'T0') {
    return NextResponse.json(
      { error: 'Recipient has not completed KYC and cannot receive transfers.' },
      { status: 409 },
    );
  }

  // ── Fraud assessment ───────────────────────────────────────────────────────
  const risk = await assessRisk({
    userId: sender.id,
    action: 'p2p_send',
    amountMinor: amount,
    currency,
    counterpartyUserId: recipientFrenz.user.id,
  });
  if (risk.decision === 'hold') {
    return NextResponse.json(
      { error: 'This transfer was blocked for your security. Contact support.', riskScore: risk.score },
      { status: 403 },
    );
  }
  if (risk.decision === 'review') {
    logger.warn({ userId: sender.id, risk }, 'P2P flagged for review but allowed');
  }

  // ── Balance check ──────────────────────────────────────────────────────────
  const senderBalance = await availableBalanceOf(prisma, sender.id, currency);
  if (senderBalance < amount) {
    return NextResponse.json(
      {
        error: `Insufficient ${currency} balance.`,
        available: senderBalance.toString(),
        required: amount.toString(),
      },
      { status: 402 },
    );
  }

  // ── Daily P2P send limit check ────────────────────────────────────────────
  const tierLimit = await prisma.kycTierLimit.findUnique({
    where: { tier: sender.kycTier },
    select: { p2pSendLimitDailyCents: true },
  });

  if (tierLimit && tierLimit.p2pSendLimitDailyCents > 0n) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sumToday: { _sum: { amount: bigint | null } } = await prisma.transaction.aggregate({
      where: {
        initiatorUserId: sender.id,
        type: 'P2P',
        currency,
        status: { in: ['PENDING', 'POSTED'] },
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });

    const alreadySent = sumToday._sum.amount ?? 0n;
    if (alreadySent + amount > tierLimit.p2pSendLimitDailyCents) {
      return NextResponse.json(
        {
          error: 'Daily P2P send limit exceeded for your tier.',
          dailyLimitMinor: tierLimit.p2pSendLimitDailyCents.toString(),
          alreadySentMinor: alreadySent.toString(),
        },
        { status: 429 },
      );
    }
  }

  // ── Post the transaction ───────────────────────────────────────────────────
  const senderAccountId = await ensureAccount(prisma, sender.id, currency, 'AVAILABLE');
  const recipientAccountId = await ensureAccount(prisma, recipientFrenz.user.id, currency, 'AVAILABLE');

  const result = await postTransaction(prisma, {
    type: 'P2P',
    idempotencyKey,
    lines: [
      {
        debitAccountId: senderAccountId,
        creditAccountId: recipientAccountId,
        amount: Money.of(amount, currency),
      },
    ],
    initiatorUserId: sender.id,
    counterpartyUserId: recipientFrenz.user.id,
    metadata: {
      recipientTag: tag,
      note: note ?? null,
    },
  });

  // Create the P2PTransfer row linked to this transaction
  const p2pTransfer = await prisma.p2PTransfer.create({
    data: {
      transactionId: result.id,
      senderId: sender.id,
      recipientId: recipientFrenz.user.id,
      note: note ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: sender.id,
      action: 'P2P_SEND',
      resourceType: 'P2PTransfer',
      resourceId: p2pTransfer.id,
      metadata: {
        recipientId: recipientFrenz.user.id,
        recipientTag: tag,
        amountMinor: amount.toString(),
        currency,
      },
    },
  });

  logger.info(
    { senderId: sender.id, recipientId: recipientFrenz.user.id, amount: amount.toString(), currency },
    'P2P transfer sent',
  );

  return NextResponse.json(
    {
      transactionId: result.id,
      status: result.status,
      p2pTransferId: p2pTransfer.id,
      recipient: {
        tag: recipientFrenz.tag,
        displayName: `${recipientFrenz.user.firstName ?? ''} ${(recipientFrenz.user.lastName ?? '').charAt(0)}.`.trim(),
      },
      amountMinor: amount.toString(),
      currency,
    },
    { status: 201 },
  );
}
