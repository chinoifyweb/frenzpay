// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/cards/graph/[id]/fund
 *
 * Top up a Graph virtual card from the master wallet. The master wallet
 * debit happens server-side inside Graph — we just issue the instruction.
 *
 * Body: { amount: integer USD cents }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { fundGraphCard, isGraphConfigured } from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  amount: z.number().int().positive().max(10_000_000_00),
  custom_reference: z.string().max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Card funding not configured' }, { status: 503 });
  }

  const card = await prisma.card.findUnique({
    where: { id },
    select: { id: true, externalCardId: true, userId: true, status: true },
  });
  if (!card || card.userId !== session.userId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }
  if (card.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: `Cannot fund a ${card.status} card` },
      { status: 409 },
    );
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

  try {
    const res = await fundGraphCard(card.externalCardId, parsed.data.amount, {
      custom_reference: parsed.data.custom_reference,
      idempotencyKey: `card-fund-${card.id}-${Date.now()}`,
    });
    logger.info(
      { userId: session.userId, cardId: id, amount: parsed.data.amount },
      'Graph card funded',
    );
    return NextResponse.json({ ok: true, result: res });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cardId: id, err: msg }, '[cards/graph/fund] failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
