// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/fx/conversion
 *
 * Execute an FX swap via Graph's /conversion endpoint. USD ⇆ NGN only today;
 * additional pairs will open up as Graph adds support.
 *
 * Body:
 *   currency_source:      'USD' | 'NGN'
 *   currency_destination: 'USD' | 'NGN'
 *   amount_source:        integer subunits (cents for USD, kobo for NGN)
 *   rate_id (optional):   lock a previously-quoted rate from /api/fx/quote.
 *                           Omit to take the current market rate at execution.
 *
 * The server must find the user's Graph accounts to debit/credit. We resolve
 * those from UserExternalAccount (graph rail) + look up the graphPersonId
 * indirectly — Graph itself figures the source/destination accounts if not
 * specified, we just pass the IDs when available for clarity.
 *
 * Response mirrors Graph's — conversion_id + status + fx_rate applied.
 * Subsequent status updates arrive via conversion.* webhooks (Phase E stub).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { getIdempotencyKey } from '@/lib/idempotency';
import { prisma } from '@frenzpay/db';
import {
  createGraphConversion,
  type GraphConversionPayload,
  isGraphConfigured,
} from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  currency_source: z.enum(['USD', 'NGN']),
  currency_destination: z.enum(['USD', 'NGN']),
  amount_source: z.number().int().positive().max(10_000_000_00),
  rate_id: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  // Idempotency-Key required — see lib/idempotency.ts. A network retry of
  // an FX conversion would otherwise debit + credit twice at Graph.
  const idem = getIdempotencyKey(req, 'fx-conversion');
  if (!idem.ok) return idem.response;
  const idempotencyKey = idem.key;

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'FX conversions are not configured yet' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  if (parsed.data.currency_source === parsed.data.currency_destination) {
    return NextResponse.json({ error: 'Source and destination must differ' }, { status: 422 });
  }

  // ── Resolve source/destination Graph account ids (best-effort) ─────────
  const [source, dest] = await Promise.all([
    prisma.userExternalAccount.findFirst({
      where: {
        userId: session.userId,
        provider: 'graph',
        currency: parsed.data.currency_source,
        NOT: { status: 'closed' },
      },
      select: { externalAccountId: true },
    }),
    prisma.userExternalAccount.findFirst({
      where: {
        userId: session.userId,
        provider: 'graph',
        currency: parsed.data.currency_destination,
        NOT: { status: 'closed' },
      },
      select: { externalAccountId: true },
    }),
  ]);

  const payload: GraphConversionPayload = {
    currency_source: parsed.data.currency_source,
    currency_destination: parsed.data.currency_destination,
    amount_source: parsed.data.amount_source,
    rate_id: parsed.data.rate_id,
    account_id_source: source?.externalAccountId,
    account_id_destination: dest?.externalAccountId,
  };

  try {
    const result = await createGraphConversion(payload, {
      idempotencyKey,
    });
    logger.info(
      {
        userId: session.userId,
        conversionId: result.conversionId,
        from: parsed.data.currency_source,
        to: parsed.data.currency_destination,
        amount_source: parsed.data.amount_source,
        fx_rate: result.fx_rate,
      },
      'Graph conversion initiated',
    );
    return NextResponse.json({
      ok: true,
      conversion_id: result.conversionId,
      status: result.status,
      fx_rate: result.fx_rate ?? null,
      from_amount: result.from_amount ?? null,
      to_amount: result.to_amount ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId: session.userId, err: msg }, '[fx/conversion] failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
