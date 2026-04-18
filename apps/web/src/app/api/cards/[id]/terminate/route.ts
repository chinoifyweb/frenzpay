/**
 * POST /api/cards/[id]/terminate
 * Permanently terminate a card. Requires PIN step-up. NOT reversible.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { terminateBridgeCard } from '@frenzpay/providers/bridge-cards';

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
    select: { id: true, externalCardId: true, status: true, last4: true },
  });

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.status === 'TERMINATED') return NextResponse.json({ ok: true });

  await terminateBridgeCard(card.externalCardId);
  await prisma.card.update({ where: { id: card.id }, data: { status: 'TERMINATED' } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: 'CARD_TERMINATED',
      resourceType: 'Card', resourceId: card.id, metadata: { last4: card.last4 },
    },
  });

  return NextResponse.json({ ok: true, status: 'TERMINATED' });
}
