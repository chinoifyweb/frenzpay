/**
 * POST /api/accounts/usd/provision — legacy compatibility shim.
 *
 * Superseded by /api/accounts/activate which takes an explicit currency.
 * Old clients that expected a body-less POST-to-provision still work: this
 * route calls the same bridge helpers with currency hardcoded to USD.
 * New UI code should call /api/accounts/activate with { currency: 'USD' }
 * directly.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { ensureBridgeCustomer, ensureBridgeVirtualAccount } from '@/lib/bridge-provision';

export async function POST() {
  const { session } = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, kycTier: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Complete KYC verification before activating a USD account.' },
      { status: 403 },
    );
  }

  const customer = await ensureBridgeCustomer(session.userId, { triggeredBy: 'user' });
  if (!customer.ok) {
    return NextResponse.json({ error: customer.error ?? 'Could not onboard to Bridge.' }, { status: 502 });
  }

  const va = await ensureBridgeVirtualAccount(session.userId, 'USD', { triggeredBy: 'user' });
  if (!va.ok) {
    return NextResponse.json({ error: va.error ?? 'Could not activate USD account.' }, { status: 502 });
  }

  return NextResponse.json(
    {
      currency: 'USD',
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
