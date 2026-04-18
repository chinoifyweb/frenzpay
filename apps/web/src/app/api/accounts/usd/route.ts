/**
 * GET /api/accounts/usd
 * Returns the authenticated user's Bridge USD virtual account details (if any).
 *
 * Used by the wallet UI's "Receive USD" panel. Routing/account numbers are
 * safe to return to the user themselves.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET() {
  const { session } = await requireSession();

  const virtualAccount = await prisma.userExternalAccount.findFirst({
    where: {
      userId: session.userId,
      provider: 'bridge',
      type: 'virtual_account',
      status: 'active',
    },
    select: {
      id: true,
      externalAccountId: true,
      accountName: true,
      routingNumber: true,
      accountNumber: true,
      bankName: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  });

  if (!virtualAccount) {
    return NextResponse.json({ virtualAccount: null });
  }

  return NextResponse.json({
    virtualAccount: {
      id: virtualAccount.id,
      externalAccountId: virtualAccount.externalAccountId,
      accountName: virtualAccount.accountName,
      routingNumber: virtualAccount.routingNumber,
      accountNumber: virtualAccount.accountNumber,
      bankName: virtualAccount.bankName,
      currency: virtualAccount.currency,
      status: virtualAccount.status,
      createdAt: virtualAccount.createdAt.toISOString(),
    },
  });
}
