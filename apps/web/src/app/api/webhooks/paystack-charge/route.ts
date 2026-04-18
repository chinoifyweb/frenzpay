/**
 * POST /api/webhooks/paystack-charge
 * Handles Paystack `charge.success` events for payment-link checkouts.
 * Separate from /api/webhooks/paystack (payouts) so the two flows don't share
 * event-ID namespace and can be disabled independently.
 *
 * On charge.success:
 *   - Find the associated PaymentLink by reference prefix `frenz-pl-`
 *   - Post ledger transaction:
 *       debit:  external_world_<currency>  (funds enter from outside)
 *       credit: paystack_ngn_float         (omnibus, for NGN)
 *                 OR bridge_usd_omnibus    (for USD)
 *       debit:  that omnibus
 *       credit: recipient user's <currency>.AVAILABLE
 *     (Simplified: we collapse into one multi-line transaction with matching
 *      debits/credits per currency.)
 *   - Deduct platform fee
 *   - Mark PaymentLink as COMPLETED if type=fixed
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { verifyPaystackWebhookSignature } from '@frenzpay/providers/paystack';
import { ensureAccount, getSystemAccount, postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

// Platform fee on received payments: 1% capped at $10 equivalent
const PLATFORM_FEE_BPS = 100; // 1%
const PLATFORM_FEE_CAP_CENTS = 1000n; // $10

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.event !== 'charge.success') {
    return NextResponse.json({ status: 'ignored' });
  }

  const reference = (payload.data['reference'] as string | undefined) ?? '';
  if (!reference.startsWith('frenz-pl-')) {
    return NextResponse.json({ status: 'not_a_payment_link' });
  }

  const eventId = `ps-charge-${reference}`;
  const existing = await prisma.paystackWebhookEvent.findUnique({
    where: { id: eventId }, select: { processedAt: true },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ status: 'already_processed' });
  }

  await prisma.paystackWebhookEvent.upsert({
    where: { id: eventId },
    create: { id: eventId, eventType: payload.event, payload: payload as unknown as Record<string, unknown> },
    update: { payload: payload as unknown as Record<string, unknown>, error: null },
  });

  try {
    const metadata = payload.data['metadata'] as Record<string, unknown> | null;
    const paymentLinkId = metadata?.['paymentLinkId'] as string | undefined;
    const recipientUserId = metadata?.['recipientUserId'] as string | undefined;
    const amount = BigInt(payload.data['amount'] as string | number);
    const currency = (payload.data['currency'] as string) ?? 'NGN';

    if (!paymentLinkId || !recipientUserId) {
      throw new Error('Missing metadata.paymentLinkId or metadata.recipientUserId');
    }

    const link = await prisma.paymentLink.findUnique({
      where: { id: paymentLinkId },
      select: { id: true, userId: true, type: true },
    });
    if (!link || link.userId !== recipientUserId) {
      throw new Error(`Payment link mismatch: ${paymentLinkId}`);
    }

    // Compute platform fee
    const rawFee = (amount * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
    const cap = currency === 'NGN' ? PLATFORM_FEE_CAP_CENTS * 1600n : PLATFORM_FEE_CAP_CENTS;
    const feeMinor = rawFee > cap ? cap : rawFee;
    const netToRecipient = amount - feeMinor;

    // Post the credit transaction
    const externalAccountName =
      currency === 'USD' ? 'external_world_usd'
      : currency === 'USDC' ? 'external_world_usdc'
      : 'external_world_ngn';
    const feeAccountName = currency === 'NGN' ? 'fees_ngn' : 'fees_usd';

    const externalId = await getSystemAccount(prisma, externalAccountName);
    const feeId = await getSystemAccount(prisma, feeAccountName);
    const recipientId = await ensureAccount(prisma, recipientUserId, currency, 'AVAILABLE');

    await postTransaction(prisma, {
      type: 'DEPOSIT',
      idempotencyKey: `pl-credit-${reference}`,
      lines: [
        // Net to recipient
        { debitAccountId: externalId, creditAccountId: recipientId, amount: Money.of(netToRecipient, currency) },
        // Platform fee
        { debitAccountId: externalId, creditAccountId: feeId, amount: Money.of(feeMinor, currency) },
      ],
      counterpartyUserId: recipientUserId,
      externalRef: reference,
      feeAmount: Money.of(feeMinor, currency),
      metadata: {
        provider: 'paystack',
        paymentLinkId,
        payerEmail: payload.data['customer'] ? (payload.data['customer'] as Record<string, unknown>)['email'] ?? null : null,
      },
    });

    // Close fixed links after a successful charge
    if (link.type === 'fixed') {
      await prisma.paymentLink.update({
        where: { id: link.id }, data: { status: 'COMPLETED' },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: recipientUserId, action: 'PAYMENT_LINK_PAID',
        resourceType: 'PaymentLink', resourceId: link.id,
        metadata: { reference, amountMinor: amount.toString(), feeMinor: feeMinor.toString(), currency },
      },
    });

    await prisma.paystackWebhookEvent.update({
      where: { id: eventId }, data: { processedAt: new Date() },
    });

    logger.info(
      { paymentLinkId, recipientUserId, amountMinor: amount.toString(), currency },
      'Payment link charge credited',
    );

    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ eventId, err: message }, 'Payment-link charge webhook failed');
    await prisma.paystackWebhookEvent.update({
      where: { id: eventId }, data: { error: message },
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
