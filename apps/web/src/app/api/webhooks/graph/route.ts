/**
 * POST /api/webhooks/graph
 *
 * Graph (usegraph.io / Oval) webhook receiver.
 *
 * Security
 *   - Signature verified via verifyGraphWebhookSignature() — HMAC-SHA256
 *     against GRAPH_WEBHOOK_SECRET by default; scheme will be confirmed
 *     and finalised once we pull the specifics from the Graph dashboard.
 *   - Events are deduped via the GraphWebhookEvent table.
 *
 * Handled event_types (stub handlers at the moment — ledger posting will be
 * wired up in Phase 2b once we see a real payload):
 *   Issuance:
 *     account.created / account.issuance.failed / account.migrated /
 *     account.closed / card.created / card.issuance.failed / card.frozen /
 *     card.closed
 *   Transactions:
 *     account.credit     — deposit received → post to ledger (debit
 *                           graph_ngn_float, credit user.NGN.AVAILABLE)
 *     payout.success / payout.failed
 *     card.transaction
 *     conversion.success / conversion.failed
 *
 * GET / HEAD return 200 so Graph's reachability probe marks the endpoint
 * Active in their dashboard when a new webhook is saved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { verifyGraphWebhookSignature } from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';
import { captureError } from '@/lib/observability';
import { createHash } from 'node:crypto';

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'graph' });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // We don't know yet which header Graph uses — accept the common candidates
  // and treat the first non-empty one as authoritative.
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

  // ── Parse body ───────────────────────────────────────────────────────────
  let payload: { event_type?: string; entity?: Record<string, unknown>; data?: Record<string, unknown>; id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.event_type) {
    return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
  }

  // Graph may or may not send a top-level event id. If not, synthesise a
  // deterministic id from the raw body so retries dedupe.
  const eventId =
    (typeof payload.id === 'string' && payload.id) ||
    (payload.entity && typeof payload.entity === 'object' && 'id' in payload.entity
      ? `${payload.event_type}:${(payload.entity as { id: string }).id}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 16)}`
      : `${payload.event_type}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 24)}`);

  // ── Idempotency ──────────────────────────────────────────────────────────
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

  // ── Dispatch ─────────────────────────────────────────────────────────────
  try {
    switch (payload.event_type) {
      case 'account.credit':
        await handleAccountCredit(eventId, payload);
        break;
      case 'account.created':
      case 'account.issuance.failed':
      case 'account.migrated':
      case 'account.closed':
      case 'card.created':
      case 'card.issuance.failed':
      case 'card.frozen':
      case 'card.closed':
      case 'card.transaction':
      case 'payout.success':
      case 'payout.failed':
      case 'conversion.success':
      case 'conversion.failed':
        // Known types — logged but not acted on yet. Phase 2b wires the
        // DB updates for each. For now we mark processed so they don't
        // retry forever.
        logger.info(
          { eventId, eventType: payload.event_type },
          'Graph webhook received (handler pending)',
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

// ─── Handlers ────────────────────────────────────────────────────────────

/**
 * account.credit — deposit received on a Graph virtual account. Wire this up
 * once we have a real payload example. Minimum we need:
 *   - bank account id       → resolve to UserExternalAccount.userId
 *   - amount                → BigInt minor units
 *   - settlement currency   → 'NGN' for Graph
 * Then post a double-entry transaction: debit graph_ngn_float,
 * credit user.NGN.AVAILABLE.
 */
async function handleAccountCredit(eventId: string, payload: { data?: Record<string, unknown>; entity?: Record<string, unknown> }): Promise<void> {
  logger.info(
    {
      eventId,
      keys: Object.keys(payload.data ?? {}),
      entityKeys: Object.keys(payload.entity ?? {}),
    },
    'Graph account.credit received — ledger posting is Phase 2b',
  );
  // Intentionally no-op for now. Leaving the payload keys in the log so the
  // first real event gives us a reference for wiring the real handler.
}
