/**
 * GET /api/accounts
 * Returns the authenticated user's accounts with live balances per currency.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { listUserAccounts } from '@frenzpay/ledger';

export async function GET() {
  const { session } = await requireSession();

  const accounts = await listUserAccounts(prisma, session.userId);

  // Group by currency for easy client rendering
  const byCurrency: Record<string, Array<{ id: string; subtype: string; balance: string }>> = {};
  const totalByCurrency: Record<string, bigint> = {};

  for (const acc of accounts) {
    if (!byCurrency[acc.currency]) byCurrency[acc.currency] = [];
    byCurrency[acc.currency]!.push({
      id: acc.id,
      subtype: acc.subtype,
      balance: acc.balance.toString(),
    });
    if (acc.subtype === 'AVAILABLE') {
      totalByCurrency[acc.currency] = (totalByCurrency[acc.currency] ?? 0n) + acc.balance;
    }
  }

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      currency: a.currency,
      subtype: a.subtype,
      balance: a.balance.toString(),
    })),
    byCurrency,
    available: Object.fromEntries(
      Object.entries(totalByCurrency).map(([k, v]) => [k, v.toString()]),
    ),
  });
}
