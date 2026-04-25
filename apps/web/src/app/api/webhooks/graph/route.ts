/**
 * POST /api/webhooks/graph
 *
 * Graph (usegraph / Oval) webhook receiver.
 *
 * Security:
 *   - Signature verified by verifyGraphWebhookSignature() — HMAC-SHA256 over
 *     the raw body by default. GRAPH_WEBHOOK_VERIFY=0 bypasses (for the
 *     initial handshake before Graph tells us their signing scheme).
 *   - Deduplication via GraphWebhookEvent.id (Graph's event id if present,
 *     otherwise a deterministic hash of the body).
 *
 * Handled event types:
 *   Issuance:
 *     account.created            — mark UserExternalAccount active + persist
 *                                   materialised account_number/bank fields.
 *     account.issuance.failed    — mark UserExternalAccount failed + store
 *                                   reason; surface via admin alert.
 *     account.migrated           — noted only, ops follows up in Graph dashboard.
 *     account.closed             — mark UserExternalAccount closed.
 *     card.created               — mark Card active.
 *     card.issuance.failed       — mark Card closed + store reason.
 *     card.frozen                — mark Card frozen.
 *     card.closed                — mark Card closed.
 *
 *   Transactions:
 *     account.credit             — deposit landed. Post a DEPOSIT Transaction:
 *                                   debit external_world_<currency>,
 *                                   credit user.<currency>.AVAILABLE.
 *     payout.success             — Graph paid out our Withdrawal:
 *                                   mark Withdrawal SETTLED + store externalRef.
 *     payout.failed              — Graph failed the payout:
 *                                   mark Withdrawal FAILED + refund ledger.
 *     conversion.success         — conversion executed; log for reconciliation.
 *     conversion.failed          — conversion failed; log for retry.
 *     card.transaction           — card charge; post CARD_AUTH transaction.
 *
 * GET / HEAD return 200 so Graph's reachability probe marks the endpoint
 * Active in their dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { verifyGraphWebhookSignature } from '@frenzpay/providers/graph';
import { postTransaction, ensureAccount, getSystemAccount } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';
import { captureError } from '@/lib/observability';

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'graph' });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// ─── Types shared across handlers ────────────────────────────────────────────

interface WebhookEnvelope {
  event_type?: string;
  id?: string;
  entity?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** Helper: read a string field from a possibly-nested object (obj.key or obj.data.key). */
function readString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function readNumber(obj: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.match(/^-?\d+(\.\d+)?$/)) return Number(v);
  }
  return null;
}

// ─── POST entry ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Accept any of the common signature header names; the first non-empty wins.
  const signature =
    req.headers.get('graph-signature') ??
    req.headers.get('x-graph-signature') ??
    req.headers.get('webhook-signature') ??
    req.headers.get('x-webhook-signature') ??
    req.headers.get('signature') ??
    '';

  if (!verifyGraphWebhookSignature(rawBody, signature)) {
    logger.warn(
      { signatureHead: signature.slice(0, 8), bodyLength: rawBody.length },
      'Graph webhook signature verification failed',
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: WebhookEnvelope;
  try {
    payload = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.event_type) {
    return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
  }

  // Deterministic dedup id when Graph doesn't supply one.
  const eventId =
    (typeof payload.id === 'string' && payload.id) ||
    (payload.entity && typeof payload.entity === 'object' && 'id' in payload.entity
      ? `${payload.event_type}:${(payload.entity as { id: string }).id}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 16)}`
      : `${payload.event_type}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 24)}`);

  const existing = await prisma.graphWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true, processedAt: true },
  });
  if (existing?.processedAt) {
    logger.info({ eventId, eventType: payload.event_type }, 'Graph event already processed');
    return NextResponse.json({ status: 'already_processed' });
  }

  await prisma.graphWebhookEvent.upsert({
    where: { id: eventId },
    create: {
      id: eventId,
      eventType: payload.event_type,
      payload: payload as unknown as Record<string, unknown>,
    },
    update: {
      payload: payload as unknown as Record<string, unknown>,
      error: null,
    },
  });

  try {
    switch (payload.event_type) {
      case 'account.created':
        await handleAccountCreated(eventId, payload);
        break;
      case 'account.issuance.failed':
        await handleAccountIssuanceFailed(eventId, payload);
        break;
      case 'account.migrated':
      case 'account.closed':
        await handleAccountStatusEvent(eventId, payload);
        break;
      case 'account.credit':
        await handleAccountCredit(eventId, payload);
        break;
      case 'payout.success':
        await handlePayoutSuccess(eventId, payload);
        break;
      case 'payout.failed':
        await handlePayoutFailed(eventId, payload);
        break;
      case 'card.created':
      case 'card.issuance.failed':
      case 'card.frozen':
      case 'card.closed':
        await handleCardEvent(eventId, payload);
        break;
      case 'card.transaction':
        await handleCardTransaction(eventId, payload);
        break;
      case 'conversion.success':
      case 'conversion.failed':
        // Logged for now; FX conversion reconciliation comes with Phase H
        // wire-up.
        logger.info(
          { eventId, eventType: payload.event_type },
          'Graph webhook received (handler stub)',
        );
        break;
      default:
        logger.info(
          { eventId, eventType: payload.event_type },
          'Graph webhook: unknown event type',
        );
    }

    await prisma.graphWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: null },
    });
    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { eventId, eventType: payload.event_type, err: message },
      'Graph webhook processing failed',
    );
    await captureError(err, { webhook: 'graph', eventId, eventType: payload.event_type });

    await prisma.graphWebhookEvent.update({
      where: { id: eventId },
      data: { error: message },
    });

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * account.created — a virtual bank account we asked for is now active. Lift
 * any fields that only materialise post-creation (account_number, bank_code,
 * routing_number) onto our UserExternalAccount row.
 */
async function handleAccountCreated(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalAccountId = readString(data, 'id', 'bank_account_id', 'account_id');
  if (!externalAccountId) {
    logger.warn({ eventId }, 'account.created missing bank account id');
    return;
  }
  const accountNumber = readString(data, 'account_number');
  const accountName = readString(data, 'account_name');
  const bankName = readString(data, 'bank_name');
  const bankCode = readString(data, 'bank_code');
  const routingNumber = readString(data, 'routing_number');
  const swiftCode = readString(data, 'swift_code');

  const existing = await prisma.userExternalAccount.findFirst({
    where: { provider: 'graph', externalAccountId },
    select: { id: true, metadata: true },
  });
  if (!existing) {
    logger.warn(
      { eventId, externalAccountId },
      'account.created for unknown UserExternalAccount — was this account created outside our flow?',
    );
    return;
  }

  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  if (bankCode) meta['bank_code'] = bankCode;
  if (swiftCode) meta['swift_code'] = swiftCode;

  await prisma.userExternalAccount.update({
    where: { id: existing.id },
    data: {
      status: 'active',
      accountNumber: accountNumber ?? undefined,
      accountName: accountName ?? undefined,
      bankName: bankName ?? undefined,
      routingNumber: routingNumber ?? undefined,
      metadata: meta,
    },
  });
  logger.info({ eventId, externalAccountId }, 'UserExternalAccount marked active');
}

async function handleAccountIssuanceFailed(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalAccountId = readString(data, 'id', 'bank_account_id', 'account_id');
  const reason = readString(data, 'reason', 'failure_reason', 'message') ?? 'unknown';
  if (!externalAccountId) {
    logger.warn({ eventId }, 'account.issuance.failed missing account id');
    return;
  }
  const existing = await prisma.userExternalAccount.findFirst({
    where: { provider: 'graph', externalAccountId },
    select: { id: true, metadata: true },
  });
  if (!existing) {
    logger.warn({ eventId, externalAccountId }, 'account.issuance.failed for unknown account');
    return;
  }
  const meta = (existing.metadata ?? {}) as Record<string, unknown>;
  meta['issuance_failure_reason'] = reason;
  await prisma.userExternalAccount.update({
    where: { id: existing.id },
    data: { status: 'failed', metadata: meta },
  });
  logger.warn({ eventId, externalAccountId, reason }, 'UserExternalAccount issuance failed');
}

async function handleAccountStatusEvent(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalAccountId = readString(data, 'id', 'bank_account_id', 'account_id');
  if (!externalAccountId) return;
  const status =
    payload.event_type === 'account.closed' ? 'closed' :
    payload.event_type === 'account.migrated' ? 'migrated' :
    'active';
  await prisma.userExternalAccount.updateMany({
    where: { provider: 'graph', externalAccountId },
    data: { status },
  });
  logger.info({ eventId, externalAccountId, status }, 'UserExternalAccount status updated');
}

/**
 * account.credit — a deposit landed in a user's Graph virtual account.
 *
 * Ledger posting (per Graph's "Account Credit" payload shape):
 *   amount is in subunits, currency is NGN/USD/EUR.
 *   debit  external_world_<currency>  (funds left the outside world)
 *   credit user.<currency>.AVAILABLE  (user's balance increased)
 *
 * Idempotency key is the Graph event id — duplicate deliveries post nothing.
 */
async function handleAccountCredit(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalAccountId = readString(data, 'account_id', 'bank_account_id', 'id');
  const amountRaw = readNumber(data, 'amount', 'credit_amount');
  const currency = readString(data, 'currency')?.toUpperCase();

  if (!externalAccountId || !amountRaw || !currency) {
    logger.warn(
      { eventId, hasAccount: !!externalAccountId, amount: amountRaw, currency },
      'account.credit missing required fields — logged and ignored',
    );
    return;
  }

  // Resolve to our user
  const external = await prisma.userExternalAccount.findFirst({
    where: { provider: 'graph', externalAccountId },
    select: { id: true, userId: true, currency: true },
  });
  if (!external) {
    logger.warn(
      { eventId, externalAccountId },
      'account.credit for unknown Graph bank account — dropping',
    );
    return;
  }

  // Build ledger lines
  const externalWorldAccountName = `external_world_${currency.toLowerCase()}`;
  let externalWorldAccountId: string;
  try {
    externalWorldAccountId = await getSystemAccount(prisma, externalWorldAccountName);
  } catch (err) {
    // Missing system account — log loudly, but don't crash the webhook. Ops
    // runs the seed script to provision these.
    logger.error(
      { eventId, externalWorldAccountName, err: err instanceof Error ? err.message : err },
      'Missing system account for deposit credit',
    );
    throw err;
  }

  const userAvailableAccountId = await ensureAccount(
    prisma,
    external.userId,
    currency,
    'AVAILABLE',
  );

  const amount = BigInt(Math.round(amountRaw)); // amount is already in subunits
  const idempotencyKey = `graph-deposit-${eventId}`;

  const tx = await postTransaction(prisma, {
    type: 'DEPOSIT',
    idempotencyKey,
    externalRef: externalAccountId,
    initiatorUserId: external.userId,
    lines: [
      {
        debitAccountId: externalWorldAccountId,
        creditAccountId: userAvailableAccountId,
        amount,
      },
    ],
    metadata: {
      source: 'graph.account.credit',
      externalAccountId,
      graphEventId: eventId,
    },
  });

  logger.info(
    {
      eventId,
      userId: external.userId,
      currency,
      amountSubunits: amount.toString(),
      transactionId: tx.id,
    },
    'Graph deposit posted to ledger',
  );
}

/**
 * payout.success — Graph successfully paid out a payout we initiated. Mark
 * the matching Withdrawal SETTLED. Ledger entries for the payout are written
 * at the time the Withdrawal is created; we just need to record completion.
 */
async function handlePayoutSuccess(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const payoutId = readString(data, 'id', 'payout_id');
  if (!payoutId) {
    logger.warn({ eventId }, 'payout.success missing payout id');
    return;
  }

  const withdrawal = await prisma.withdrawal.findFirst({
    where: { externalRef: payoutId, provider: 'graph' },
    select: { id: true, status: true, transaction: { select: { initiatorUserId: true } } },
  });
  if (!withdrawal) {
    logger.warn({ eventId, payoutId }, 'payout.success for unknown withdrawal');
    return;
  }
  if (withdrawal.status === 'SETTLED') {
    logger.info({ eventId, payoutId }, 'payout.success: already settled');
    return;
  }

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status: 'SETTLED', settledAt: new Date() },
  });
  logger.info(
    {
      eventId,
      payoutId,
      withdrawalId: withdrawal.id,
      userId: withdrawal.transaction.initiatorUserId,
    },
    'Withdrawal marked SETTLED',
  );
}

/**
 * payout.failed — Graph couldn't complete the payout. Mark Withdrawal FAILED
 * and refund the user's balance: reverse the HOLD entry so funds return to
 * AVAILABLE.
 */
async function handlePayoutFailed(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const payoutId = readString(data, 'id', 'payout_id');
  const reason = readString(data, 'reason', 'failure_reason', 'message') ?? 'unknown';
  if (!payoutId) {
    logger.warn({ eventId }, 'payout.failed missing payout id');
    return;
  }

  const withdrawal = await prisma.withdrawal.findFirst({
    where: { externalRef: payoutId, provider: 'graph' },
    select: {
      id: true,
      status: true,
      sourceAmountCents: true,
      transactionId: true,
      transaction: { select: { initiatorUserId: true, currency: true } },
    },
  });
  if (!withdrawal) {
    logger.warn({ eventId, payoutId }, 'payout.failed for unknown withdrawal');
    return;
  }
  if (withdrawal.status === 'FAILED' || withdrawal.status === 'REFUNDED') {
    logger.info({ eventId, payoutId }, 'payout.failed: already terminal');
    return;
  }

  const userId = withdrawal.transaction.initiatorUserId;
  if (!userId) {
    logger.warn({ eventId, payoutId }, 'payout.failed: no user on transaction');
    return;
  }

  // Refund: debit user.<currency>.HOLD → credit user.<currency>.AVAILABLE
  const currency = withdrawal.transaction.currency;
  const holdAccountId = await ensureAccount(prisma, userId, currency, 'HOLD');
  const availableAccountId = await ensureAccount(prisma, userId, currency, 'AVAILABLE');
  const amount = withdrawal.sourceAmountCents;
  const idempotencyKey = `graph-refund-${eventId}`;

  await prisma.$transaction(async (tx: any) => {
    await postTransaction(tx, {
      type: 'REFUND',
      idempotencyKey,
      externalRef: payoutId,
      initiatorUserId: userId,
      lines: [
        {
          debitAccountId: holdAccountId,
          creditAccountId: availableAccountId,
          amount,
        },
      ],
      metadata: {
        source: 'graph.payout.failed',
        withdrawalId: withdrawal.id,
        reason,
        graphEventId: eventId,
      },
    });
    await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: 'REFUNDED', failureReason: reason },
    });
  });

  logger.info(
    {
      eventId,
      payoutId,
      withdrawalId: withdrawal.id,
      userId,
      reason,
      refundAmountSubunits: amount.toString(),
    },
    'Withdrawal failed + refund posted',
  );
}

/** card.* events — update Card.status only. */
async function handleCardEvent(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalCardId = readString(data, 'id', 'card_id');
  if (!externalCardId) {
    logger.warn({ eventId }, 'card.* event missing card id');
    return;
  }

  const newStatus =
    payload.event_type === 'card.created'
      ? 'ACTIVE'
      : payload.event_type === 'card.issuance.failed' || payload.event_type === 'card.closed'
        ? 'CLOSED'
        : payload.event_type === 'card.frozen'
          ? 'FROZEN'
          : null;
  if (!newStatus) return;

  const card = await prisma.card.findUnique({ where: { externalCardId } });
  if (!card) {
    logger.warn({ eventId, externalCardId }, 'card.* event for unknown card');
    return;
  }
  await prisma.card.update({
    where: { externalCardId },
    data: { status: newStatus as any },
  });
  logger.info({ eventId, externalCardId, newStatus }, 'Card status updated from webhook');
}

/**
 * card.transaction — fired by Graph when a virtual card is charged at a
 * merchant. We respond by:
 *   1. Logging an audit event with the transaction details.
 *   2. Charging the configured per-transaction fees on top:
 *        feePctCents       = amount * cardTransactionFeePercent
 *        foreignFeeCents   = amount * cardForeignTxFeePercent  (when merchant ccy != USD)
 *      Both are debited from user.USD.AVAILABLE → fees_usd, idempotent
 *      per (transactionEventId).
 *   3. The actual card charge debit (the merchant amount) is handled
 *      separately by Graph's settlement to our master wallet — see the
 *      account.credit / account.debit webhook flow. The fee here is the
 *      OUR-CUT only.
 *
 * Skipped silently when both fee percentages are 0 — we still log the
 * underlying tx for reconciliation.
 */
async function handleCardTransaction(eventId: string, payload: WebhookEnvelope) {
  const data = payload.data ?? payload.entity ?? {};
  const externalCardId = readString(data, 'card_id', 'card', 'card_external_id');
  const amountSubunits = readNumber(data, 'amount', 'amount_subunits');
  const merchantCurrency = (readString(data, 'currency', 'merchant_currency') ?? 'USD').toUpperCase();
  const merchantName = readString(data, 'merchant_name', 'description');

  if (!externalCardId || !amountSubunits) {
    logger.warn(
      { eventId, hasCard: !!externalCardId, amount: amountSubunits },
      'card.transaction missing card_id or amount — logging only',
    );
    return;
  }

  const card = await prisma.card.findUnique({
    where: { externalCardId },
    select: { id: true, userId: true },
  });
  if (!card) {
    logger.warn({ eventId, externalCardId }, 'card.transaction for unknown card');
    return;
  }

  // Read fee config
  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: ['cardTransactionFeePercent', 'cardForeignTxFeePercent'] } },
    select: { key: true, value: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map: Record<string, any> = Object.fromEntries(
    settings.map((s: { key: string; value: unknown }) => [s.key, s.value]),
  );
  const txPct = typeof map.cardTransactionFeePercent === 'number'
    ? map.cardTransactionFeePercent
    : Number(map.cardTransactionFeePercent) || 0;
  const fxPct = typeof map.cardForeignTxFeePercent === 'number'
    ? map.cardForeignTxFeePercent
    : Number(map.cardForeignTxFeePercent) || 0;

  const isForeign = merchantCurrency !== 'USD';
  const txFeeCents = Math.floor(amountSubunits * (txPct / 100));
  const fxFeeCents = isForeign ? Math.floor(amountSubunits * (fxPct / 100)) : 0;
  const totalFeeCents = txFeeCents + fxFeeCents;

  if (totalFeeCents <= 0) {
    logger.info(
      { eventId, externalCardId, amountSubunits, merchantCurrency },
      'card.transaction logged (no fees configured)',
    );
    return;
  }

  // Lazy-import the ledger helpers (already inlined into the cron bundle but
  // we use the same here for the route handler).
  const { ensureAccount, getSystemAccount, postTransaction, balanceOf } = await import(
    '@frenzpay/ledger'
  );

  const availableAccountId = await ensureAccount(prisma, card.userId, 'USD', 'AVAILABLE');
  const balance = await balanceOf(prisma, availableAccountId);
  if (balance < BigInt(totalFeeCents)) {
    // Insufficient balance to cover the fee — log + skip; ops can chase.
    // We don't go negative.
    logger.warn(
      {
        eventId,
        userId: card.userId,
        externalCardId,
        amountSubunits,
        totalFeeCents,
        balance: balance.toString(),
      },
      'card.transaction fee skipped: insufficient USD balance',
    );
    return;
  }

  const feesAccountId = await getSystemAccount(prisma, 'fees_usd');
  await prisma.$transaction(async (tx: any) => {
    await postTransaction(tx, {
      type: 'FEE',
      idempotencyKey: `card-tx-fee-${eventId}`,
      initiatorUserId: card.userId,
      lines: [
        {
          debitAccountId: availableAccountId,
          creditAccountId: feesAccountId,
          amount: BigInt(totalFeeCents),
        },
      ],
      metadata: {
        kind: 'card_transaction',
        externalCardId,
        amountSubunits,
        merchantCurrency,
        merchantName,
        txFeeCents,
        fxFeeCents,
        isForeign,
        graphEventId: eventId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: card.userId,
        action: 'CARD_TRANSACTION_FEE_CHARGED',
        resourceType: 'Card',
        resourceId: card.id,
        metadata: {
          eventId,
          amountSubunits,
          merchantCurrency,
          merchantName,
          txFeeCents,
          fxFeeCents,
          totalFeeCents,
        },
      },
    });
  });

  logger.info(
    {
      eventId,
      cardId: card.id,
      userId: card.userId,
      amountSubunits,
      merchantCurrency,
      totalFeeCents,
      txFeeCents,
      fxFeeCents,
    },
    'card.transaction fee posted',
  );
}
