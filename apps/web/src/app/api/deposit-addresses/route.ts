// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/deposit-addresses — list the caller's crypto deposit addresses
 * POST /api/deposit-addresses — provision a new USDC/USDT deposit address
 *
 * Backed by Graph's /address endpoint. We don't store addresses locally —
 * every list fetches from Graph directly, scoped to the user's Graph Person.
 * On POST we create the address AND cache it in UserExternalAccount with
 * provider='graph' + type='deposit_address' so we can resolve webhooks
 * back to the user quickly.
 *
 * Body for POST:
 *   currency: 'USDC' | 'USDT'
 *   network:  'ERC20' | 'TRC20' | 'POL'
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import {
  createGraphDepositAddress,
  listGraphDepositAddresses,
  isGraphConfigured,
  type GraphDepositAddressPayload,
} from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const CreateSchema = z.object({
  currency: z.enum(['USDC', 'USDT']),
  network: z.enum(['ERC20', 'TRC20', 'POL']),
});

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const { session } = await requireSession();

  if (!isGraphConfigured()) {
    return NextResponse.json({ addresses: [] });
  }

  // Pull from local cache so the Dashboard is fast; the Graph list is a
  // source-of-truth check you'd hit on reconciliation, not page-load.
  const rows = await prisma.userExternalAccount.findMany({
    where: {
      userId: session.userId,
      provider: 'graph',
      type: 'deposit_address',
    },
    select: {
      id: true,
      externalAccountId: true,
      accountNumber: true, // we re-use accountNumber as the wallet address
      currency: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    addresses: rows.map((r: (typeof rows)[number]) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        graphAddressId: r.externalAccountId,
        address: r.accountNumber ?? '',
        currency: r.currency,
        network: typeof meta['network'] === 'string' ? meta['network'] : null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  if (!isGraphConfigured()) {
    return NextResponse.json(
      { error: 'Crypto deposit addresses not configured' },
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
    select: { graphPersonId: true, kycTier: true, status: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json({ error: 'KYC T2+ required' }, { status: 403 });
  }
  if (!user.graphPersonId) {
    return NextResponse.json(
      { error: 'Your Graph profile is not set up yet.' },
      { status: 409 },
    );
  }

  // Already-provisioned address for this (currency, network)?
  const existing = await prisma.userExternalAccount.findFirst({
    where: {
      userId: session.userId,
      provider: 'graph',
      type: 'deposit_address',
      currency: parsed.data.currency,
      metadata: { path: ['network'], equals: parsed.data.network },
    },
    select: {
      externalAccountId: true,
      accountNumber: true,
      currency: true,
      metadata: true,
      createdAt: true,
    },
  });
  if (existing) {
    return NextResponse.json({
      address: existing.accountNumber,
      graphAddressId: existing.externalAccountId,
      currency: existing.currency,
      network: parsed.data.network,
      createdAt: existing.createdAt.toISOString(),
      reused: true,
    });
  }

  try {
    const payload: GraphDepositAddressPayload = {
      person_id: user.graphPersonId,
      currency: parsed.data.currency,
      network: parsed.data.network,
    };
    const res = await createGraphDepositAddress(payload, {
      idempotencyKey: `addr-${session.userId}-${parsed.data.currency}-${parsed.data.network}`,
    });

    await prisma.userExternalAccount.create({
      data: {
        userId: session.userId,
        provider: 'graph',
        externalAccountId: res.addressId,
        type: 'deposit_address',
        currency: parsed.data.currency,
        accountNumber: res.address,
        status: 'active',
        metadata: { network: parsed.data.network },
      },
    });

    logger.info(
      {
        userId: session.userId,
        graphAddressId: res.addressId,
        currency: res.currency,
        network: res.network,
      },
      'Graph deposit address provisioned',
    );

    return NextResponse.json(
      {
        address: res.address,
        graphAddressId: res.addressId,
        currency: res.currency,
        network: res.network,
        reused: false,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId: session.userId, err: msg }, '[deposit-addresses] create failed');
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
