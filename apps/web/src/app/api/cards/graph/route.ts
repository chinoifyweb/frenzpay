/**
 * POST /api/cards/graph — issue a USD virtual debit card via Graph
 * GET  /api/cards/graph — list Graph-issued cards for the caller
 *
 * Parallel surface to /api/cards (which talks to Bridge). We keep them
 * separate so each provider's rules live in one place — Graph has different
 * funding mechanics (master wallet debit), different secure_settings (phone
 * + 8-digit PIN), and its own webhook lifecycle.
 *
 * Body for POST:
 *   label?:          display name (default "Primary card")
 *   funding_amount:  integer subunits (USD cents, min $10.00 = 1000)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { createGraphCard, isGraphConfigured } from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const CreateSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  funding_amount: z.number().int().min(1000).max(10_000_000_00),
});

export async function GET() {
  const { session } = await requireSession();

  // Filter cards that belong to Graph — we distinguish via externalCardId
  // prefix once we see real Graph card ids. For now, list all and surface a
  // `provider` hint. When Bridge vs Graph provenance becomes important the
  // prefix check makes this cheap.
  const cards = await prisma.card.findMany({
    where: { userId: session.userId, status: { not: 'TERMINATED' } },
    select: {
      id: true,
      externalCardId: true,
      last4: true,
      expiryMonth: true,
      expiryYear: true,
      brand: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    cards: cards.map((c: (typeof cards)[number]) => ({
      id: c.id,
      externalCardId: c.externalCardId,
      last4: c.last4,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      brand: c.brand,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  if (!isGraphConfigured()) {
    return NextResponse.json(
      { error: 'Graph card issuance is not configured on this environment' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, kycTier: true, status: true, graphPersonId: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json({ error: 'KYC T2+ required to issue a card.' }, { status: 403 });
  }
  if (!user.graphPersonId) {
    return NextResponse.json(
      { error: 'Your Graph profile is not set up yet. Admin must approve KYC first.' },
      { status: 409 },
    );
  }

  try {
    const res = await createGraphCard(
      {
        person_id: user.graphPersonId,
        label: parsed.data.label ?? 'Primary card',
        funding_amount: parsed.data.funding_amount,
      },
      { idempotencyKey: `graph-card-${session.userId}-${Date.now()}` },
    );

    // Placeholder fields — card.created webhook populates last4/expiry/brand
    // once Graph finishes provisioning the PAN.
    const card = await prisma.card.create({
      data: {
        userId: session.userId,
        externalCardId: res.cardId,
        last4: '----',
        expiryMonth: 0,
        expiryYear: 0,
        brand: 'Visa',
        status: 'ACTIVE',
      },
      select: { id: true, externalCardId: true, status: true, createdAt: true },
    });

    logger.info(
      {
        userId: session.userId,
        externalCardId: res.cardId,
        funding_amount: parsed.data.funding_amount,
      },
      'Graph card issuance requested',
    );

    return NextResponse.json(
      {
        ok: true,
        card: {
          id: card.id,
          externalCardId: card.externalCardId,
          status: card.status,
          createdAt: card.createdAt.toISOString(),
        },
        note: 'Card is being provisioned — details (PAN/expiry) arrive after Graph confirms via webhook.',
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId: session.userId, err: msg }, '[cards/graph] create failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
