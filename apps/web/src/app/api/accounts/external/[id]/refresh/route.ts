/**
 * POST /api/accounts/external/[id]/refresh
 *
 * Customer-side endpoint to pull the latest state of one of THEIR
 * virtual accounts from Graph. Used by the dashboard accounts page
 * when the bank details haven't populated yet (status='pending') —
 * the customer hits Refresh and we fetch + persist the current
 * account_number / routing_number / bank_name.
 *
 * Hardened: only updates a row that belongs to the calling user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { fetchGraphBankAccount } from '@frenzpay/providers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const row = await prisma.userExternalAccount.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, provider: true, externalAccountId: true },
  });
  if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  if (row.provider !== 'graph') {
    return NextResponse.json(
      { error: `Refresh not supported for provider '${row.provider}'.` },
      { status: 400 },
    );
  }
  if (!row.externalAccountId) {
    return NextResponse.json({ error: 'Row has no external account id' }, { status: 400 });
  }

  let upstream: unknown;
  try {
    upstream = await fetchGraphBankAccount(row.externalAccountId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to refresh' },
      { status: 502 },
    );
  }

  // graphFetch unwraps { data, status, message } now, so `upstream` IS
  // the bank-account record.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct: any = upstream;
  await prisma.userExternalAccount.update({
    where: { id: row.id },
    data: {
      accountName: acct?.account_name ?? undefined,
      accountNumber: acct?.account_number ?? undefined,
      routingNumber: acct?.routing_number ?? undefined,
      bankName: acct?.bank_name ?? undefined,
      status: acct?.status ?? undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    status: acct?.status ?? null,
    accountName: acct?.account_name ?? null,
    accountNumber: acct?.account_number ?? null,
    routingNumber: acct?.routing_number ?? null,
    bankName: acct?.bank_name ?? null,
  });
}
