/**
 * POST /api/cards/[id]/freeze
 * Freeze a user's active card (reversible via /unfreeze).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { freezeBridgeCard } from '@frenzpay/providers/bridge-cards';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireSession();
  const { id } = await params;

  const card = await prisma.card.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, externalCardId: true, status: true },
  });

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.status === 'TERMINATED') return NextResponse.json({ error: 'Card is terminated' }, { status: 409 });
  if (card.status === 'FROZEN') return NextResponse.json({ ok: true, status: 'FROZEN' });

  await freezeBridgeCard(card.externalCardId);

  await prisma.card.update({ where: { id: card.id }, data: { status: 'FROZEN' } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId, action: 'CARD_FROZEN',
      resourceType: 'Card', resourceId: card.id,
    },
  });

  return NextResponse.json({ ok: true, status: 'FROZEN' });
}
