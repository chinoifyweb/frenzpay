/**
 * POST /api/webhooks/bridge-card
 * Handles Bridge card authorization events.
 *
 * Events:
 *   card.authorization.created  — merchant swiped card → hold funds
 *   card.authorization.cleared  — transaction settled → capture hold
 *   card.authorization.reversed — merchant voided → release hold
 *   card.authorization.declined — card declined → no action (record only)
 *
 * Ledger flow:
 *   created  → hold(): user.USDC.AVAILABLE -> user.USDC.HOLD
 *   cleared  → HOLD -> bridge_usd_omnibus (settle to Bridge), plus any auth-vs-cleared delta release
 *   reversed → HOLD -> AVAILABLE (release)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { verifyBridgeWebhookSignature } from '@frenzpay/providers/bridge';
import { ensureAccount, getSystemAccount, postTransaction, Money, hold, release } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('bridge-signature') ?? req.headers.get('x-bridge-signature') ?? '';

  if (!verifyBridgeWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { id: string; event_type: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.id || !payload.event_type) {
    return NextResponse.json({ error: 'Missing event id or type' }, { status: 400 });
  }

  // Reuse BridgeWebhookEvent table — all Bridge events share it
  const existing = await prisma.bridgeWebhookEvent.findUnique({
    where: { id: payload.id }, select: { processedAt: true },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ status: 'already_processed' });
  }

  await prisma.bridgeWebhookEvent.upsert({
    where: { id: payload.id },
    create: { id: payload.id, eventType: payload.event_type, payload: payload as unknown as Record<string, unknown> },
    update: { payload: payload as unknown as Record<string, unknown>, error: null },
  });

  try {
    switch (payload.event_type) {
      case 'card.authorization.created':
        await handleAuthCreated(payload);
        break;
      case 'card.authorization.cleared':
        await handleAuthCleared(payload);
        break;
      case 'card.authorization.reversed':
        await handleAuthReversed(payload);
        break;
      case 'card.authorization.declined':
        await handleAuthDeclined(payload);
        break;
      default:
        logger.info({ eventType: payload.event_type }, 'Bridge card webhook: unhandled event');
    }

    await prisma.bridgeWebhookEvent.update({
      where: { id: payload.id }, data: { processedAt: new Date() },
    });
    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ eventId: payload.id, err: message }, 'Bridge card webhook failed');
    await prisma.bridgeWebhookEvent.update({
      where: { id: payload.id }, data: { error: message },
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

interface AuthEvent {
  id: string;
  data: {
    authorization_id?: string;
    card_id?: string;
    amount?: string | number;
    currency?: string;
    merchant_name?: string;
    merchant_category?: string;
    cleared_amount?: string | number;
    [k: string]: unknown;
  };
}

async function handleAuthCreated(event: AuthEvent): Promise<void> {
  const authId = event.data.authorization_id as string;
  const cardId = event.data.card_id as string;
  const amount = BigInt(event.data.amount as string | number);

  const card = await prisma.card.findUnique({
    where: { externalCardId: cardId }, select: { id: true, userId: true, status: true },
  });
  if (!card) throw new Error(`Unknown card: ${cardId}`);

  const { transactionId } = await hold(prisma, card.userId, Money.of(amount, 'USDC'), `card-auth-${authId}`);

  await prisma.cardAuthorization.create({
    data: {
      cardId: card.id,
      transactionId,
      externalAuthId: authId,
      merchantName: (event.data.merchant_name as string) ?? null,
      merchantCategory: (event.data.merchant_category as string) ?? null,
      authAmountCents: amount,
      currency: (event.data.currency as string) ?? 'USDC',
      status: 'PENDING',
    },
  });
}

async function handleAuthCleared(event: AuthEvent): Promise<void> {
  const authId = event.data.authorization_id as string;
  const clearedAmount = BigInt(event.data.cleared_amount ?? event.data.amount as string | number);

  const auth = await prisma.cardAuthorization.findUnique({
    where: { externalAuthId: authId },
    select: { id: true, cardId: true, authAmountCents: true, currency: true, card: { select: { userId: true } } },
  });
  if (!auth) throw new Error(`Unknown card auth: ${authId}`);

  const userId = auth.card.userId;

  // Post the settlement: HOLD -> bridge_usd_omnibus (card provider drains funds)
  const holdAccount = await ensureAccount(prisma, userId, auth.currency, 'HOLD');
  const omnibus = await getSystemAccount(prisma, 'bridge_usd_omnibus');

  await postTransaction(prisma, {
    type: 'CARD_CAPTURE',
    idempotencyKey: `card-clear-${authId}`,
    lines: [{ debitAccountId: holdAccount, creditAccountId: omnibus, amount: Money.of(clearedAmount, auth.currency) }],
    initiatorUserId: userId,
    externalRef: authId,
    metadata: { authId, clearedAmount: clearedAmount.toString() },
  });

  // If cleared < auth, release the remainder from HOLD back to AVAILABLE
  const authAmount: bigint = auth.authAmountCents as unknown as bigint;
  const remainder = authAmount - clearedAmount;
  if (remainder > 0n) {
    await release(prisma, userId, Money.of(remainder, auth.currency), `card-clear-release-${authId}`);
  }

  await prisma.cardAuthorization.update({
    where: { id: auth.id },
    data: { status: 'CLEARED', clearedAmountCents: clearedAmount, clearedAt: new Date() },
  });
}

async function handleAuthReversed(event: AuthEvent): Promise<void> {
  const authId = event.data.authorization_id as string;

  const auth = await prisma.cardAuthorization.findUnique({
    where: { externalAuthId: authId },
    select: { id: true, authAmountCents: true, currency: true, card: { select: { userId: true } } },
  });
  if (!auth) throw new Error(`Unknown card auth: ${authId}`);

  await release(
    prisma, auth.card.userId,
    Money.of(auth.authAmountCents as unknown as bigint, auth.currency),
    `card-reverse-${authId}`,
  );

  await prisma.cardAuthorization.update({
    where: { id: auth.id },
    data: { status: 'REVERSED' },
  });
}

async function handleAuthDeclined(event: AuthEvent): Promise<void> {
  const authId = event.data.authorization_id as string;

  // No ledger movement for declines — just record for audit
  const existing = await prisma.cardAuthorization.findUnique({
    where: { externalAuthId: authId }, select: { id: true },
  });
  if (existing) {
    await prisma.cardAuthorization.update({
      where: { id: existing.id }, data: { status: 'DECLINED' },
    });
    return;
  }

  const cardId = event.data.card_id as string;
  const card = await prisma.card.findUnique({ where: { externalCardId: cardId }, select: { id: true } });
  if (!card) return;

  await prisma.cardAuthorization.create({
    data: {
      cardId: card.id,
      externalAuthId: authId,
      authAmountCents: BigInt(event.data.amount as string | number),
      currency: (event.data.currency as string) ?? 'USDC',
      merchantName: (event.data.merchant_name as string) ?? null,
      status: 'DECLINED',
    },
  });
}
