/**
 * POST /api/accounts/provision
 * Ensures the authenticated user has baseline AVAILABLE accounts for USD, NGN, USDC.
 * Idempotent — safe to call multiple times.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { provisionUserAccounts } from '@frenzpay/ledger';

export async function POST() {
  const { session } = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { kycTier: true },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // T0 users can't hold balances
  if (user.kycTier === 'T0') {
    return NextResponse.json(
      { error: 'Complete KYC (T1 or higher) before provisioning accounts.' },
      { status: 403 },
    );
  }

  const accounts = await provisionUserAccounts(prisma, session.userId, ['USD', 'NGN', 'USDC']);

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'ACCOUNTS_PROVISIONED',
      resourceType: 'Account',
      resourceId: session.userId,
      metadata: { currencies: Object.keys(accounts) },
    },
  });

  return NextResponse.json({ accounts });
}
