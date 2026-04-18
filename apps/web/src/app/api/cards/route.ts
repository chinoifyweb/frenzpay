/**
 * GET  /api/cards — list the authenticated user's cards
 * POST /api/cards — issue a new virtual card (T2+ gated, requires PIN)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyUserPin } from '@/lib/pin';
import { issueBridgeCard } from '@frenzpay/providers/bridge-cards';
import { generateBridgeIdempotencyKey } from '@frenzpay/providers/bridge';
import { logger } from '@frenzpay/logger';

const MAX_CARDS_PER_USER = 5;

export async function GET() {
  const { session } = await requireSession();

  const cards = await prisma.card.findMany({
    where: { userId: session.userId, status: { not: 'TERMINATED' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, last4: true, expiryMonth: true, expiryYear: true, brand: true,
      status: true, dailyLimitCents: true, monthlyLimitCents: true, createdAt: true,
    },
  });

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cards: cards.map((c: any) => ({
      ...c,
      dailyLimitCents: c.dailyLimitCents?.toString() ?? null,
      monthlyLimitCents: c.monthlyLimitCents?.toString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

const IssueSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  dailyLimitCents: z.string().regex(/^[0-9]+$/).optional(),
  monthlyLimitCents: z.string().regex(/^[0-9]+$/).optional(),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const pinResult = await verifyUserPin(session.userId, parsed.data.pin);
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, firstName: true, lastName: true, kycTier: true,
      cards: { where: { status: { not: 'TERMINATED' } }, select: { id: true } },
      externalAccounts: {
        where: { provider: 'bridge', type: 'bridge_customer' },
        select: { externalAccountId: true },
        take: 1,
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Virtual cards require Advanced KYC (T2).' },
      { status: 403 },
    );
  }

  if (user.cards.length >= MAX_CARDS_PER_USER) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_CARDS_PER_USER} active cards.` },
      { status: 409 },
    );
  }

  const bridgeCustomer = user.externalAccounts[0];
  if (!bridgeCustomer) {
    return NextResponse.json(
      { error: 'Provision a USD account first before issuing a card.' },
      { status: 409 },
    );
  }

  const cardholderName =
    `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toUpperCase();

  const issueResult = await issueBridgeCard(
    {
      customerId: bridgeCustomer.externalAccountId,
      dailyLimitCents: parsed.data.dailyLimitCents ? BigInt(parsed.data.dailyLimitCents) : undefined,
      monthlyLimitCents: parsed.data.monthlyLimitCents ? BigInt(parsed.data.monthlyLimitCents) : undefined,
      cardholderName,
    },
    generateBridgeIdempotencyKey(`card-${user.id}`),
  );

  const card = await prisma.card.create({
    data: {
      userId: user.id,
      externalCardId: issueResult.cardId,
      last4: issueResult.last4,
      expiryMonth: issueResult.expiryMonth,
      expiryYear: issueResult.expiryYear,
      brand: issueResult.brand,
      status: issueResult.status.toUpperCase(),
      dailyLimitCents: parsed.data.dailyLimitCents ? BigInt(parsed.data.dailyLimitCents) : null,
      monthlyLimitCents: parsed.data.monthlyLimitCents ? BigInt(parsed.data.monthlyLimitCents) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'CARD_ISSUED',
      resourceType: 'Card',
      resourceId: card.id,
      metadata: { brand: issueResult.brand, last4: issueResult.last4 },
    },
  });

  logger.info({ userId: user.id, cardId: card.id }, 'Virtual card issued');

  return NextResponse.json(
    {
      card: {
        id: card.id,
        last4: card.last4,
        brand: card.brand,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        status: card.status,
      },
    },
    { status: 201 },
  );
}
