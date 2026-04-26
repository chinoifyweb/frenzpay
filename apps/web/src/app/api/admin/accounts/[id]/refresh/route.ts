/**
 * POST /api/admin/accounts/[id]/refresh
 *
 * Pulls the latest state for a UserExternalAccount from the upstream
 * provider (Graph) and updates our DB row. Useful right after
 * provisioning when the bank account is still `pending` and the
 * account_number / routing_number aren't yet populated — admin clicks
 * Refresh and we go fetch the latest values from Graph.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { fetchGraphBankAccount } from '@frenzpay/providers';
import { logger } from '@frenzpay/logger';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const row = await prisma.userExternalAccount.findUnique({
    where: { id },
    select: { id: true, provider: true, externalAccountId: true, userId: true, currency: true },
  });
  if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  if (row.provider !== 'graph') {
    return NextResponse.json(
      { error: `Refresh not supported for provider '${row.provider}'.` },
      { status: 400 },
    );
  }
  if (!row.externalAccountId) {
    return NextResponse.json({ error: 'Row has no external_account_id' }, { status: 400 });
  }

  let upstream: unknown;
  try {
    upstream = await fetchGraphBankAccount(row.externalAccountId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch from Graph' },
      { status: 502 },
    );
  }

  // graphFetch unwraps { data, status, message } now, so `upstream` IS
  // the bank-account record. Defensive — type-narrow before reading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct: any = upstream;
  const accountName: string | null = acct?.account_name ?? null;
  const accountNumber: string | null = acct?.account_number ?? null;
  const routingNumber: string | null = acct?.routing_number ?? null;
  const bankName: string | null = acct?.bank_name ?? null;
  const status: string = acct?.status ?? 'unknown';

  await prisma.userExternalAccount.update({
    where: { id: row.id },
    data: {
      accountName: accountName ?? undefined,
      accountNumber: accountNumber ?? undefined,
      routingNumber: routingNumber ?? undefined,
      bankName: bankName ?? undefined,
      status,
      metadata: {
        last_refresh_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: acct as Record<string, unknown>,
      } as Record<string, unknown>,
    },
  });

  logger.info(
    { adminId: session.userId, ueaId: row.id, status },
    'admin refreshed virtual account from Graph',
  );

  return NextResponse.json({
    ok: true,
    status,
    accountName,
    accountNumber,
    routingNumber,
    bankName,
  });
}
