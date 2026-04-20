/**
 * POST /api/webhooks/bridge
 * Bridge webhook handler — receives notifications about incoming deposits.
 *
 * Security:
 * - Signature verified via HMAC-SHA256(BRIDGE_WEBHOOK_SECRET, rawBody)
 * - Events are deduplicated via BridgeWebhookEvent table
 *
 * Handled events:
 *   virtual_account.activity.created  — new incoming deposit (wire or ACH)
 *                                       → credits user's USDC AVAILABLE account
 *   virtual_account.status.updated    — account status change (pass-through)
 *   customer.status.updated           — customer KYC status change
 *
 * Ledger posting for a deposit:
 *   debit:  bridge_usd_omnibus         (USDC left Bridge custody -> our omnibus)
 *   credit: user.USDC.AVAILABLE        (credit to user's stablecoin balance)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { verifyBridgeWebhookSignature } from '@frenzpay/providers/bridge';
import { ensureAccount, getSystemAccount, postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';
import { captureError } from '@/lib/observability';

/**
 * GET / HEAD — reachability probe.
 * Bridge does a GET to the webhook URL when you enable a webhook in their
 * dashboard; if the endpoint returns anything other than 2xx they flag it
 * as unreachable and refuse to enable. Event delivery still goes via POST
 * with signature verification.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'bridge' });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  // Bridge canonical header is `Webhook-Signature`; older SDK / proxy paths
  // forwarded the signature under `Bridge-Signature` or `X-Bridge-Signature`.
  const signature =
    req.headers.get('webhook-signature') ??
    req.headers.get('bridge-signature') ??
    req.headers.get('x-bridge-signature') ??
    '';

  // ── Verify signature ───────────────────────────────────────────────────────
  if (!verifyBridgeWebhookSignature(rawBody, signature)) {
    logger.warn({ signature: signature.slice(0, 8) }, 'Bridge webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let payload: {
    id: string;
    event_type: string;
    created_at: string;
    data: Record<string, unknown>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.id || !payload.event_type) {
    return NextResponse.json({ error: 'Missing event id or type' }, { status: 400 });
  }

  // ── Idempotency: dedupe by event ID ────────────────────────────────────────
  const existing = await prisma.bridgeWebhookEvent.findUnique({
    where: { id: payload.id },
    select: { id: true, processedAt: true },
  });

  if (existing?.processedAt) {
    logger.info({ eventId: payload.id, eventType: payload.event_type }, 'Bridge event already processed');
    return NextResponse.json({ status: 'already_processed' });
  }

  // Record the event first (pending)
  await prisma.bridgeWebhookEvent.upsert({
    where: { id: payload.id },
    create: {
      id: payload.id,
      eventType: payload.event_type,
      payload: payload as unknown as Record<string, unknown>,
    },
    update: {
      payload: payload as unknown as Record<string, unknown>,
      error: null,
    },
  });

  // ── Dispatch by event type ─────────────────────────────────────────────────
  try {
    switch (payload.event_type) {
      case 'virtual_account.activity.created':
        await handleDepositActivity(payload);
        break;
      case 'virtual_account.status.updated':
        await handleVirtualAccountStatusUpdate(payload);
        break;
      case 'customer.status.updated':
        await handleCustomerStatusUpdate(payload);
        break;
      default:
        logger.info({ eventType: payload.event_type }, 'Bridge webhook: unhandled event type');
    }

    await prisma.bridgeWebhookEvent.update({
      where: { id: payload.id },
      data: { processedAt: new Date(), error: null },
    });

    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ eventId: payload.id, eventType: payload.event_type, err: message }, 'Bridge webhook processing failed');
    await captureError(err, { webhook: 'bridge', eventId: payload.id, eventType: payload.event_type });

    await prisma.bridgeWebhookEvent.update({
      where: { id: payload.id },
      data: { error: message },
    });

    // Return 500 so Bridge retries. A stuck event remains in the table for manual review.
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  event_type: string;
  data: {
    virtual_account_id?: string;
    amount?: string | number;
    currency?: string;
    source?: { type?: string; sender_name?: string };
    [k: string]: unknown;
  };
}

async function handleDepositActivity(event: ActivityEvent): Promise<void> {
  const { virtual_account_id, amount, currency, source } = event.data;

  if (!virtual_account_id || !amount || !currency) {
    throw new Error(`Missing required fields: virtual_account_id=${virtual_account_id} amount=${amount} currency=${currency}`);
  }

  // Look up the user by virtual account ID
  const va = await prisma.userExternalAccount.findFirst({
    where: {
      provider: 'bridge',
      type: 'virtual_account',
      externalAccountId: virtual_account_id,
    },
    select: { id: true, userId: true, currency: true, accountName: true },
  });

  if (!va) {
    throw new Error(`Unknown virtual account: ${virtual_account_id}`);
  }

  // Convert amount to minor units (BigInt)
  // Bridge sends USDC amounts as decimal strings (e.g. "100.50"). USDC has 6 decimals.
  const minorUnits = decimalToMinor(String(amount), 6);

  // Ensure accounts exist
  const userUsdcAccount = await ensureAccount(prisma, va.userId, 'USDC', 'AVAILABLE');
  const omnibusAccount = await getSystemAccount(prisma, 'bridge_usd_omnibus');

  // Post the deposit ledger transaction (idempotency via event ID)
  await postTransaction(prisma, {
    type: 'DEPOSIT',
    idempotencyKey: `bridge-deposit-${event.id}`,
    lines: [
      {
        debitAccountId: omnibusAccount,
        creditAccountId: userUsdcAccount,
        amount: Money.of(minorUnits, 'USDC'),
      },
    ],
    initiatorUserId: va.userId,
    externalRef: event.id,
    metadata: {
      provider: 'bridge',
      virtualAccountId: virtual_account_id,
      sourceType: source?.type ?? 'unknown',
      senderName: source?.sender_name ?? null,
      rawAmount: amount,
      rawCurrency: currency,
    },
  });

  logger.info(
    { userId: va.userId, amount: minorUnits.toString(), currency: 'USDC', eventId: event.id },
    'Bridge deposit credited',
  );

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: va.userId,
      action: 'BRIDGE_DEPOSIT_RECEIVED',
      resourceType: 'UserExternalAccount',
      resourceId: va.id,
      metadata: {
        eventId: event.id,
        amountUsdcMinor: minorUnits.toString(),
        sourceType: source?.type ?? 'unknown',
      },
    },
  });
}

async function handleVirtualAccountStatusUpdate(event: ActivityEvent): Promise<void> {
  const vaId = event.data['virtual_account_id'] as string | undefined;
  const newStatus = event.data['status'] as string | undefined;

  if (!vaId || !newStatus) {
    logger.warn({ event }, 'Missing fields in virtual_account.status.updated');
    return;
  }

  await prisma.userExternalAccount.updateMany({
    where: { provider: 'bridge', externalAccountId: vaId },
    data: { status: newStatus },
  });
}

async function handleCustomerStatusUpdate(event: ActivityEvent): Promise<void> {
  const customerId = event.data['customer_id'] as string | undefined;
  const newStatus = event.data['status'] as string | undefined;

  if (!customerId || !newStatus) return;

  await prisma.userExternalAccount.updateMany({
    where: { provider: 'bridge', type: 'bridge_customer', externalAccountId: customerId },
    data: { status: newStatus },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a decimal string to a BigInt of minor units.
 * "100.50" with decimals=6 → 100_500_000n
 */
function decimalToMinor(decimal: string, decimals: number): bigint {
  const parts = decimal.trim().split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPart || '0');
}
