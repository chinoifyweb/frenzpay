/**
 * /api/accounts/[id]/whitelist
 *
 * Manage which external bank accounts are allowed to fund a user's NGN Graph
 * virtual account. Turning on whitelisting hardens the account against
 * fraudulent inbound transfers.
 *
 *   GET  — list the current whitelist entries
 *   POST — add a whitelist entry {bank_code, account_number, account_name?}
 *   DELETE (no body) — clear ALL whitelist entries
 *
 * The `id` here is our internal UserExternalAccount.id. We look up the Graph
 * bank_account id from externalAccountId and dispatch to the matching Graph
 * endpoint. Only works for provider='graph' rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import {
  addGraphWhitelistEntry,
  listGraphWhitelist,
  clearGraphWhitelist,
  isGraphConfigured,
} from '@frenzpay/providers/graph';
import { logger } from '@frenzpay/logger';

const AddSchema = z.object({
  bank_code: z.string().min(3).max(10),
  account_number: z.string().regex(/^\d{10}$/, 'NGN accounts are 10 digits'),
  account_name: z.string().max(200).optional(),
});

async function resolveAccount(
  accountId: string,
  userId: string,
): Promise<{ externalAccountId: string; currency: string } | { error: string; status: number }> {
  const ext = await prisma.userExternalAccount.findUnique({
    where: { id: accountId },
    select: { userId: true, externalAccountId: true, provider: true, currency: true },
  });
  if (!ext) return { error: 'Account not found', status: 404 };
  if (ext.userId !== userId) return { error: 'Account not found', status: 404 };
  if (ext.provider !== 'graph') {
    return { error: 'Whitelisting is only supported on Graph accounts', status: 400 };
  }
  if (ext.currency !== 'NGN') {
    return { error: 'Whitelisting is only supported on NGN accounts', status: 400 };
  }
  return { externalAccountId: ext.externalAccountId, currency: ext.currency };
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const resolved = await resolveAccount(id, session.userId);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (!isGraphConfigured()) {
    return NextResponse.json({ entries: [] });
  }

  try {
    const entries = await listGraphWhitelist(resolved.externalAccountId);
    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const resolved = await resolveAccount(id, session.userId);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Whitelisting not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const res = await addGraphWhitelistEntry(resolved.externalAccountId, parsed.data);
    logger.info(
      {
        userId: session.userId,
        accountId: id,
        bankCode: parsed.data.bank_code,
      },
      'Whitelist entry added',
    );
    return NextResponse.json({ ok: true, result: res }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ─── DELETE — clear all ─────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  const { id } = await params;

  const resolved = await resolveAccount(id, session.userId);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Whitelisting not configured' }, { status: 503 });
  }

  try {
    await clearGraphWhitelist(resolved.externalAccountId);
    logger.info({ userId: session.userId, accountId: id }, 'Whitelist cleared');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
