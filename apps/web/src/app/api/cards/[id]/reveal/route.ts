/**
 * POST /api/cards/[id]/reveal
 * Create a short-lived (60s) reveal token that the client can exchange with
 * Bridge's iframe/SDK for the full PAN + CVV. Requires PIN step-up.
 *
 * The token hash is persisted on Card.revealTokenHash so revocation can be
 * enforced server-side if needed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { createBridgeRevealToken } from '@frenzpay/providers/bridge-cards';

const Schema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireSession();
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'PIN required' }, { status: 422 });

  const pinResult = await verifyUserPin(session.userId, parsed.data.pin);
  if (!pinResult.ok) return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });

  const card = await prisma.card.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, externalCardId: true, status: true },
  });

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.status === 'TERMINATED') {
    return NextResponse.json({ error: 'Cannot reveal a terminated card' }, { status: 409 });
  }

  const reveal = await createBridgeRevealToken(card.externalCardId);

  await prisma.card.update({
    where: { id: card.id },
    data: {
      revealTokenHash: createHash('sha256').update(reveal.token).digest('hex'),
      revealTokenExpiry: reveal.expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: 'CARD_REVEAL_TOKEN_ISSUED',
      resourceType: 'Card', resourceId: card.id,
      metadata: { expiresAt: reveal.expiresAt.toISOString() },
    },
  });

  return NextResponse.json({
    token: reveal.token,
    expiresAt: reveal.expiresAt.toISOString(),
  });
}
