// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

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
import {
  ensureAccount,
  balanceOf,
  getSystemAccount,
  postTransaction,
} from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

async function readNumberSetting(key: string, fallback: number): Promise<number> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (!row) return fallback;
    if (typeof row.value === 'number') return row.value;
    if (typeof row.value === 'string') return Number(row.value) || fallback;
    return fallback;
  } catch {
    return fallback;
  }
}

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

  // ── Creation fee check ──────────────────────────────────────────────────
  // Pre-flight: load the configured fee + the user's USD balance. We need
  // total = funding + creation fee available before we ask Graph for the
  // card, so the user doesn't end up with a card and no funds (or worse,
  // negative balance once Graph debits the card itself separately).
  const creationFeeCents = await readNumberSetting('cardCreationFeeUsdCents', 0);
  const usdAvailableId = await ensureAccount(prisma, session.userId, 'USD', 'AVAILABLE');
  const usdBalance = await balanceOf(prisma, usdAvailableId);
  const totalCostCents = BigInt(parsed.data.funding_amount + creationFeeCents);
  if (usdBalance < totalCostCents) {
    return NextResponse.json(
      {
        error: `Insufficient USD balance. Need ${(Number(totalCostCents) / 100).toFixed(2)} (${(parsed.data.funding_amount / 100).toFixed(2)} funding + ${(creationFeeCents / 100).toFixed(2)} creation fee), have ${(Number(usdBalance) / 100).toFixed(2)}.`,
        availableCents: usdBalance.toString(),
        requiredCents: totalCostCents.toString(),
        creationFeeCents,
      },
      { status: 422 },
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

    // Charge the creation fee + create the Card row atomically. If Graph
    // gave us a card id but we then fail to debit, we'd leave an unfunded
    // card on Graph's side — that's a soft inconsistency we tolerate (ops
    // will reconcile during fees_usd settlement).
    const card = await prisma.$transaction(async (tx: any) => {
      if (creationFeeCents > 0) {
        const feesAccountId = await getSystemAccount(tx, 'fees_usd');
        await postTransaction(tx, {
          type: 'FEE',
          idempotencyKey: `card-create-fee-${res.cardId}`,
          initiatorUserId: session.userId,
          lines: [
            {
              debitAccountId: usdAvailableId,
              creditAccountId: feesAccountId,
              amount: BigInt(creationFeeCents),
            },
          ],
          metadata: {
            kind: 'card_creation',
            externalCardId: res.cardId,
            feeCents: creationFeeCents,
          },
        });
      }
      // Placeholder fields — card.created webhook populates last4/expiry/brand
      // once Graph finishes provisioning the PAN.
      return tx.card.create({
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
    });

    logger.info(
      {
        userId: session.userId,
        externalCardId: res.cardId,
        funding_amount: parsed.data.funding_amount,
        creationFeeCents,
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
        creationFeeCents,
        note: 'Card is being provisioned \u2014 details (PAN/expiry) arrive after Graph confirms via webhook.',
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId: session.userId, err: msg }, '[cards/graph] create failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
