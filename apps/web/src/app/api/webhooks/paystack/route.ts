/**
 * POST /api/webhooks/paystack
 * Paystack webhook handler — confirms transfer settlement and failures.
 *
 * Signature: HMAC-SHA512(PAYSTACK_SECRET_KEY, rawBody)
 * Header:    x-paystack-signature
 *
 * Handled events:
 *   transfer.success  — funds delivered to recipient bank
 *                       → posts Leg B ledger (paystack_ngn_float → external_world_ngn)
 *                       → marks Withdrawal SETTLED
 *   transfer.failed   — transfer reversed; refund user's source-currency balance
 *                       → marks Withdrawal FAILED
 *   transfer.reversed — manual reversal by Paystack
 *                       → marks Withdrawal REFUNDED
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { verifyPaystackWebhookSignature } from '@frenzpay/providers/paystack';
import { ensureAccount, getSystemAccount, postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';
import { captureError } from '@/lib/observability';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    logger.warn({ signature: signature.slice(0, 8) }, 'Paystack webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Paystack event ID = `data.reference` for transfer events (unique per transfer).
  const reference = (payload.data?.['reference'] as string | undefined) ?? '';
  const eventId = `ps-${payload.event}-${reference}`;

  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  // Idempotency: dedupe by event ID
  const existing = await prisma.paystackWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true, processedAt: true },
  });

  if (existing?.processedAt) {
    return NextResponse.json({ status: 'already_processed' });
  }

  await prisma.paystackWebhookEvent.upsert({
    where: { id: eventId },
    create: {
      id: eventId,
      eventType: payload.event,
      payload: payload as unknown as Record<string, unknown>,
    },
    update: { payload: payload as unknown as Record<string, unknown>, error: null },
  });

  try {
    switch (payload.event) {
      case 'transfer.success':
        await handleTransferSuccess(reference);
        break;
      case 'transfer.failed':
        await handleTransferFailed(reference, payload.data);
        break;
      case 'transfer.reversed':
        await handleTransferReversed(reference, payload.data);
        break;
      default:
        logger.info({ event: payload.event }, 'Paystack webhook: unhandled event');
    }

    await prisma.paystackWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: null },
    });

    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ eventId, event: payload.event, err: message }, 'Paystack webhook processing failed');
    await captureError(err, { webhook: 'paystack', eventId, event: payload.event });

    await prisma.paystackWebhookEvent.update({
      where: { id: eventId },
      data: { error: message },
    });

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleTransferSuccess(reference: string): Promise<void> {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { externalRef: reference },
    select: {
      id: true,
      destAmountKobo: true,
      status: true,
      transactionId: true,
      transaction: { select: { initiatorUserId: true } },
    },
  });

  if (!withdrawal) {
    throw new Error(`Unknown withdrawal reference: ${reference}`);
  }

  if (withdrawal.status === 'SETTLED') {
    logger.info({ reference }, 'Withdrawal already settled — skipping');
    return;
  }

  // Post Leg B: NGN float → external world
  const omnibus = await getSystemAccount(prisma, 'paystack_ngn_float');
  const externalNgn = await getSystemAccount(prisma, 'external_world_ngn');

  await postTransaction(prisma, {
    type: 'WITHDRAWAL',
    idempotencyKey: `paystack-settle-${reference}`,
    lines: [
      {
        debitAccountId: omnibus,
        creditAccountId: externalNgn,
        amount: Money.of(withdrawal.destAmountKobo, 'NGN'),
      },
    ],
    initiatorUserId: withdrawal.transaction.initiatorUserId ?? undefined,
    externalRef: reference,
    metadata: { leg: 'B', provider: 'paystack' },
  });

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status: 'SETTLED', settledAt: new Date() },
  });

  if (withdrawal.transaction.initiatorUserId) {
    await prisma.auditLog.create({
      data: {
        userId: withdrawal.transaction.initiatorUserId,
        action: 'NGN_WITHDRAWAL_SETTLED',
        resourceType: 'Withdrawal',
        resourceId: withdrawal.id,
        metadata: { reference, destKobo: withdrawal.destAmountKobo.toString() },
      },
    });
  }
}

async function handleTransferFailed(reference: string, data: Record<string, unknown>): Promise<void> {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { externalRef: reference },
    select: {
      id: true,
      status: true,
      sourceAmountCents: true,
      feeCents: true,
      transactionId: true,
      transaction: {
        select: {
          initiatorUserId: true,
          currency: true,
          metadata: true,
        },
      },
    },
  });

  if (!withdrawal) throw new Error(`Unknown withdrawal reference: ${reference}`);
  if (withdrawal.status === 'FAILED' || withdrawal.status === 'REFUNDED') return;

  const sourceCurrency = withdrawal.transaction.currency;
  const userId = withdrawal.transaction.initiatorUserId;
  if (!userId) throw new Error(`Withdrawal ${withdrawal.id} has no initiator`);

  // Refund the user: reverse Leg A by posting its inverse.
  const userSourceAccountId = await ensureAccount(prisma, userId, sourceCurrency, 'AVAILABLE');
  const feesAccountId = await getSystemAccount(prisma, 'fees_usd');
  const fxMarkupId = await getSystemAccount(prisma, 'fx_markup_usd');

  // Reconstruct source amount in minor units for the source currency
  const feeMinor: bigint = sourceCurrency === 'USDC'
    ? (withdrawal.feeCents as bigint) * 10_000n
    : (withdrawal.feeCents as bigint);
  const sourceTotalMinor: bigint = sourceCurrency === 'USDC'
    ? (withdrawal.sourceAmountCents as bigint) * 10_000n
    : (withdrawal.sourceAmountCents as bigint);
  const netMinor: bigint = sourceTotalMinor - feeMinor;

  await postTransaction(prisma, {
    type: 'REFUND',
    idempotencyKey: `paystack-fail-refund-${reference}`,
    lines: [
      // Reverse fee: fees_usd → user
      { debitAccountId: feesAccountId, creditAccountId: userSourceAccountId, amount: Money.of(feeMinor, sourceCurrency) },
      // Reverse net: fx_markup_usd → user
      { debitAccountId: fxMarkupId, creditAccountId: userSourceAccountId, amount: Money.of(netMinor, sourceCurrency) },
    ],
    initiatorUserId: userId,
    externalRef: reference,
    metadata: { leg: 'refund_on_failure', failureReason: data['reason'] ?? null },
  });

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: {
      status: 'FAILED',
      failureReason: typeof data['reason'] === 'string' ? (data['reason'] as string) : 'Paystack transfer failed',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'NGN_WITHDRAWAL_FAILED_REFUNDED',
      resourceType: 'Withdrawal',
      resourceId: withdrawal.id,
      metadata: { reference, refundedMinor: sourceTotalMinor.toString(), sourceCurrency },
    },
  });
}

async function handleTransferReversed(reference: string, data: Record<string, unknown>): Promise<void> {
  // Same logic as failure — but mark REFUNDED instead of FAILED for audit clarity
  await handleTransferFailed(reference, data);
  await prisma.withdrawal.updateMany({
    where: { externalRef: reference },
    data: { status: 'REFUNDED' },
  });
}
