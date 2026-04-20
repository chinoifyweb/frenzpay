/**
 * GET /api/accounts/external
 * Return the authenticated user's external (Bridge, etc.) accounts — the
 * virtual bank accounts the customer receives fiat into, not the ledger
 * balances.
 *
 * Shape:
 *   {
 *     accounts: [
 *       {
 *         id, provider, type, currency, activationCurrency,
 *         accountName, accountNumber, routingNumber, bankName, status
 *       }, ...
 *     ]
 *   }
 *
 * Used by /dashboard/wallet to render "Activate USD / EUR" vs showing the
 * routing + account number of already-activated rails.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET() {
  const { session } = await requireSession();

  const accounts = await prisma.userExternalAccount.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      provider: true,
      type: true,
      currency: true,
      accountName: true,
      accountNumber: true,
      routingNumber: true,
      bankName: true,
      status: true,
      metadata: true,
    },
  });

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accounts: accounts.map((a: any) => {
      const meta = (a.metadata ?? {}) as { activationCurrency?: string };
      return {
        id: a.id,
        provider: a.provider,
        type: a.type,
        currency: a.currency,
        /** The currency the user picked (USD / EUR) — for display. Settlement
         *  currency may differ (e.g. USD rail settles to USDC internally). */
        activationCurrency: meta.activationCurrency ?? a.currency,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        routingNumber: a.routingNumber,
        bankName: a.bankName,
        status: a.status,
      };
    }),
  });
}
