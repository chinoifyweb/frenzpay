// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/cards/graph/[id]/withdraw
 *
 * Withdraw funds from a Graph virtual card back to the master wallet.
 * Body: { amount: integer subunits }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { getIdempotencyKey } from '@/lib/idempotency';
import { requireCustomerTotp } from '@/lib/customer-mfa';
import { prisma } from '@frenzpay/db';
import { withdrawFromGraphCard, isGraphConfigured } from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  amount: z.number().int().positive().max(10_000_000_00),
  custom_reference: z.string().max(100).optional(),
  // Authenticator code — accepted via X-Mfa-Token header too. Required.
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  // Idempotency-Key required: a retry would otherwise drain the card
  // twice into the master wallet.
  const idem = getIdempotencyKey(req, 'card-withdraw');
  if (!idem.ok) return idem.response;
  const idempotencyKey = idem.key;

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Card withdraw not configured' }, { status: 503 });
  }

  const card = await prisma.card.findUnique({
    where: { id },
    select: { id: true, externalCardId: true, userId: true, status: true },
  });
  if (!card || card.userId !== session.userId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
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

  // TOTP gate — drains money from the card back to the wallet, same
  // money-movement class as withdrawal. Email OTP is not acceptable.
  const mfa = await requireCustomerTotp(req, session.userId, parsed.data as { totpCode?: string });
  if (!mfa.ok) return mfa.response;

  try {
    const res = await withdrawFromGraphCard(card.externalCardId, parsed.data.amount, {
      custom_reference: parsed.data.custom_reference,
      idempotencyKey,
    });
    logger.info(
      { userId: session.userId, cardId: id, amount: parsed.data.amount },
      'Graph card withdraw',
    );
    return NextResponse.json({ ok: true, result: res });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cardId: id, err: msg }, '[cards/graph/withdraw] failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
