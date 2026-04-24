// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET    /api/cards/graph/[id]           — fetch a single Graph card
 * PATCH  /api/cards/graph/[id]           — freeze/unfreeze via status flag
 * DELETE /api/cards/graph/[id]           — close permanently
 *
 * The `id` here is our internal Card.id, not the Graph card id — we resolve
 * to the Graph id via `externalCardId` and call the Graph helper.
 *
 * For the reveal-PAN flow (GET with ?decrypt=1), we call Graph's
 * /card/{id}?decrypt=true which returns the real PAN/CVV. The response is
 * forwarded DIRECTLY to the caller without touching our DB; the plaintext
 * lives only in the response body, never on our disk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import {
  fetchGraphCard,
  updateGraphCardStatus,
  closeGraphCard,
  isGraphConfigured,
} from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const PatchSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

async function resolveCard(
  cardId: string,
  sessionUserId: string,
): Promise<{ id: string; externalCardId: string; userId: string } | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, externalCardId: true, userId: true },
  });
  if (!card) return null;
  if (card.userId !== sessionUserId) return null;
  return card;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;
  const decrypt = new URL(req.url).searchParams.get('decrypt') === '1';

  const card = await resolveCard(id, session.userId);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  if (!isGraphConfigured()) {
    return NextResponse.json(
      { error: 'Card details are not available right now' },
      { status: 503 },
    );
  }

  try {
    const details = await fetchGraphCard(card.externalCardId, { decrypt });
    if (decrypt) {
      logger.info(
        { userId: session.userId, cardId: id, externalCardId: card.externalCardId },
        'Graph card PAN reveal',
      );
    }
    return NextResponse.json({ card: details });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cardId: id, err: msg }, '[cards/graph] fetch failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const card = await resolveCard(id, session.userId);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    await updateGraphCardStatus(card.externalCardId, parsed.data.status);
    // Local status mirrors Graph's — the card.frozen webhook will confirm.
    await prisma.card.update({
      where: { id: card.id },
      data: { status: parsed.data.status === 'active' ? 'ACTIVE' : 'FROZEN' },
    });
    logger.info(
      { userId: session.userId, cardId: id, newStatus: parsed.data.status },
      'Graph card status toggled',
    );
    return NextResponse.json({ ok: true, status: parsed.data.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cardId: id, err: msg }, '[cards/graph] status update failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const card = await resolveCard(id, session.userId);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  try {
    await closeGraphCard(card.externalCardId);
    await prisma.card.update({
      where: { id: card.id },
      data: { status: 'TERMINATED' },
    });
    logger.info({ userId: session.userId, cardId: id }, 'Graph card closed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cardId: id, err: msg }, '[cards/graph] close failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
