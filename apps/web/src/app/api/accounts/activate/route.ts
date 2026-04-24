/**
 * POST /api/accounts/activate
 *
 * Activate a virtual bank account on a specific rail.
 *
 * Body: { currency, provider? }
 *   currency: 'USD' | 'EUR' | 'NGN'
 *   provider: 'bridge' (USDC settlement) | 'graph' (NGN settlement)
 *             Default is inferred from currency when omitted:
 *               NGN → graph (only option)
 *               USD → graph when KYC is NG-origin, bridge otherwise
 *               EUR → bridge
 *
 * Rail semantics:
 *   bridge: USD/EUR inbound → USDC settlement. Good for crypto off-ramp.
 *   graph:  USD/EUR inbound → NGN settlement (direct Nigerian bank deposit).
 *           Graph also issues native NGN virtual accounts (NIP rail).
 *
 * Flow:
 *   1. Require T2+ KYC.
 *   2. Dispatch to ensureGraphBankAccount / ensureBridgeVirtualAccount.
 *   3. Return a uniform response (the caller doesn't need to know which rail).
 *
 * Idempotent: the user can re-activate and get the same account back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { ensureBridgeCustomer, ensureBridgeVirtualAccount } from '@/lib/bridge-provision';
import { ensureGraphBankAccount } from '@/lib/graph-provision';

const Schema = z.object({
  currency: z.enum(['USD', 'EUR', 'NGN']),
  provider: z.enum(['bridge', 'graph']).optional(),
});

type Rail = 'bridge' | 'graph';

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Pick a supported currency (USD, EUR, NGN).',
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { currency, provider: providerHint } = parsed.data;

  // ── Eligibility ─────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, kycTier: true, country: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Complete KYC verification before activating a virtual account.' },
      { status: 403 },
    );
  }

  // ── Rail selection ──────────────────────────────────────────────────────
  let rail: Rail;
  if (providerHint) {
    rail = providerHint;
  } else if (currency === 'NGN') {
    rail = 'graph';
  } else if (currency === 'USD' && user.country === 'NG') {
    rail = 'graph';
  } else {
    rail = 'bridge';
  }

  // Rail × currency compatibility
  if (rail === 'bridge' && currency === 'NGN') {
    return NextResponse.json(
      { error: 'Bridge does not issue NGN virtual accounts. Use the Graph rail for NGN.' },
      { status: 400 },
    );
  }

  // ── Dispatch ────────────────────────────────────────────────────────────
  if (rail === 'graph') {
    const result = await ensureGraphBankAccount(session.userId, currency, {
      triggeredBy: 'user',
    });
    if (!result.ok) {
      const status = result.error?.includes('KYC') ? 403 : 502;
      return NextResponse.json({ error: result.error ?? 'Activation failed' }, { status });
    }
    return NextResponse.json(
      {
        provider: 'graph',
        currency,
        virtualAccountId: result.virtualAccountId,
        accountName: result.accountName,
        accountNumber: result.accountNumber,
        bankName: result.bankName,
        bankCode: result.bankCode,
        routingNumber: result.routingNumber,
        swiftCode: result.swiftCode,
        settlementCurrency: result.settlementCurrency,
        created: result.created ?? false,
      },
      { status: result.created ? 201 : 200 },
    );
  }

  // Bridge rail — existing path, untouched.
  const customer = await ensureBridgeCustomer(session.userId, { triggeredBy: 'user' });
  if (!customer.ok) {
    return NextResponse.json(
      { error: customer.error ?? 'Could not onboard to Bridge.' },
      { status: 502 },
    );
  }

  const va = await ensureBridgeVirtualAccount(
    session.userId,
    currency as 'USD' | 'EUR',
    { triggeredBy: 'user' },
  );
  if (!va.ok) {
    const status = va.error?.includes('not yet available') ? 400 : 502;
    return NextResponse.json({ error: va.error ?? 'Could not activate account.' }, { status });
  }

  return NextResponse.json(
    {
      provider: 'bridge',
      currency,
      virtualAccountId: va.virtualAccountId,
      accountName: va.accountName,
      accountNumber: va.accountNumber,
      routingNumber: va.routingNumber,
      bankName: va.bankName,
      settlementCurrency: va.settlementCurrency,
      created: va.created,
    },
    { status: va.created ? 201 : 200 },
  );
}
