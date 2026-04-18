/**
 * POST /api/cards/[id]/unfreeze
 * Re-activate a frozen card.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { unfreezeBridgeCard } from '@frenzpay/providers/bridge-cards';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireSession();
  const { id } = await params;

  const card = await prisma.card.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, externalCardId: true, status: true },
  });

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.status === 'TERMINATED') return NextResponse.json({ error: 'Terminated cards cannot be reactivated' }, { status: 409 });
  if (card.status === 'ACTIVE') return NextResponse.json({ ok: true, status: 'ACTIVE' });

  await unfreezeBridgeCard(card.externalCardId);
  await prisma.card.update({ where: { id: card.id }, data: { status: 'ACTIVE' } });
  await prisma.auditLog.create({
    data: { userId: session.userId, action: 'CARD_UNFROZEN', resourceType: 'Card', resourceId: card.id },
  });

  return NextResponse.json({ ok: true, status: 'ACTIVE' });
}
