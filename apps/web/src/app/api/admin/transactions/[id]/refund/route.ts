// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/transactions/[id]/refund
 * Admin operational refund — reverses a POSTED transaction by posting its inverse.
 *
 * Body: { totpCode: string, reason: string }
 *
 * Does NOT edit balances directly. Instead, posts a new REFUND transaction
 * with inverted debit/credit accounts, preserving the audit trail:
 *
 *   original:  debit A → credit B  (amount X)
 *   refund:    debit B → credit A  (amount X)  [new transaction row]
 *
 * Constraints:
 *   - Only POSTED transactions can be refunded
 *   - A transaction may only be refunded once (idempotency via `refund-{originalId}`)
 *   - Amount equals original amount (no partial refunds in this endpoint — use
 *     a separate partial-refund flow for that, not yet built)
 *
 * Safeguards:
 *   - Admin TOTP + ≥ 20-char reason
 *   - AuditLog with admin ID, reason, original tx ID, refund tx ID
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { gateAdminOp } from '@/lib/admin-mfa';
import { postTransaction, Money } from '@frenzpay/ledger';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  totpCode: z.string().regex(/^\d{6}$/),
  reason: z.string().min(20).max(500),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireRole('admin');
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const gate = await gateAdminOp({
    adminUserId: session.userId,
    totpCode: parsed.data.totpCode,
    reason: parsed.data.reason,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // Load the original transaction + its ledger entries
  const original = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true, type: true, status: true, amount: true, currency: true,
      initiatorUserId: true, counterpartyUserId: true, externalRef: true,
      ledgerEntries: {
        select: { debitAccountId: true, creditAccountId: true, amount: true, currency: true },
      },
    },
  });

  if (!original) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  if (original.status !== 'POSTED') {
    return NextResponse.json(
      { error: `Transaction status is ${original.status}. Only POSTED transactions can be refunded.` },
      { status: 409 },
    );
  }

  // Refuse to refund REFUND / REVERSED transactions themselves
  if (['REFUND', 'FEE'].includes(original.type)) {
    return NextResponse.json(
      { error: `Cannot refund a ${original.type} transaction directly.` },
      { status: 409 },
    );
  }

  // Idempotency: if this transaction has already been refunded, return existing
  const existingRefund = await prisma.transaction.findUnique({
    where: { idempotencyKey: `refund-${id}` },
    select: { id: true, status: true },
  });

  if (existingRefund) {
    return NextResponse.json({
      refundTransactionId: existingRefund.id,
      status: existingRefund.status,
      idempotent: true,
    });
  }

  // Build the inverse lines
  const inverseLines = original.ledgerEntries.map((e: {
    debitAccountId: string; creditAccountId: string; amount: bigint; currency: string;
  }) => ({
    debitAccountId: e.creditAccountId,   // swap debit <-> credit
    creditAccountId: e.debitAccountId,
    amount: Money.of(e.amount as unknown as bigint, e.currency),
  }));

  if (inverseLines.length === 0) {
    return NextResponse.json({ error: 'Original transaction has no ledger entries.' }, { status: 409 });
  }

  let refundTx: { id: string; status: string };
  try {
    refundTx = await postTransaction(prisma, {
      type: 'REFUND',
      idempotencyKey: `refund-${id}`,
      lines: inverseLines,
      initiatorUserId: session.userId,                    // admin is the actor
      counterpartyUserId: original.initiatorUserId ?? undefined,
      externalRef: original.externalRef ?? undefined,
      metadata: {
        originalTransactionId: id,
        originalType: original.type,
        refundedBy: session.userId,
        reason: parsed.data.reason,
      },
    });
  } catch (err) {
    logger.error({ id, err: err instanceof Error ? err.message : err }, 'Admin refund post failed');
    return NextResponse.json({ error: 'Failed to post refund transaction.' }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'ADMIN_TRANSACTION_REFUNDED',
      resourceType: 'Transaction',
      resourceId: id,
      metadata: {
        originalTransactionId: id,
        refundTransactionId: refundTx.id,
        amountMinor: (original.amount as unknown as bigint).toString(),
        currency: original.currency,
        reason: parsed.data.reason,
      },
    },
  });

  logger.warn(
    { adminId: session.userId, originalTxId: id, refundTxId: refundTx.id },
    'Admin refund posted',
  );

  return NextResponse.json(
    {
      originalTransactionId: id,
      refundTransactionId: refundTx.id,
      status: refundTx.status,
    },
    { status: 201 },
  );
}
