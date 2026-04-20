/**
 * POST /api/accounts/activate
 *
 * Activate a virtual account in a specific currency.
 *
 * Body: { currency: 'USD' | 'EUR' }
 *
 * Flow:
 *   1. Requires T2+ KYC (verified).
 *   2. Ensures a Bridge customer record exists (belt & braces — the KYC
 *      approval flow creates this, but we don't want to fail here if that
 *      step somehow got skipped).
 *   3. Creates or returns the per-currency virtual account.
 *   4. Returns the account details (routing, account number, bank).
 *
 * Idempotent: the user can click "Activate USD" twice and get the same
 * account back without a duplicate row.
 *
 * Currency support:
 *   USD — active (Bridge)
 *   EUR — not yet wired; returns a clean error until we add a SEPA-capable
 *         provider.
 *   NGN — NOT provisioned via this endpoint. NGN is a local balance that
 *         materialises from FX conversions; there is no external bank
 *         account to provision. Returns an error suggesting the Convert
 *         flow instead.
 *   USDC — same as NGN: balance-only, no external provisioning.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { ensureBridgeCustomer, ensureBridgeVirtualAccount } from '@/lib/bridge-provision';

const Schema = z.object({
  currency: z.enum(['USD', 'EUR']),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Select a supported currency (USD or EUR).', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { currency } = parsed.data;

  // ── Eligibility ───────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, kycTier: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status === 'SUSPENDED' || user.status === 'CLOSED') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Complete KYC verification before activating a virtual account.' },
      { status: 403 },
    );
  }

  // ── Ensure Bridge customer exists (belt & braces) ────────────────────────
  const customer = await ensureBridgeCustomer(session.userId, { triggeredBy: 'user' });
  if (!customer.ok) {
    return NextResponse.json(
      { error: customer.error ?? 'Could not onboard to Bridge.' },
      { status: 502 },
    );
  }

  // ── Create/fetch the per-currency virtual account ────────────────────────
  const va = await ensureBridgeVirtualAccount(session.userId, currency, { triggeredBy: 'user' });
  if (!va.ok) {
    // EUR today returns a clean "not yet available" error — surface 400 so
    // the UI can show it as a product limitation, not a server bug.
    const status = va.error?.includes('not yet available') ? 400 : 502;
    return NextResponse.json({ error: va.error ?? 'Could not activate account.' }, { status });
  }

  return NextResponse.json(
    {
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
