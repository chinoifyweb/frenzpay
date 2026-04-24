// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/withdrawals/[id]
 *
 * Admin reviews a NGN withdrawal request (Graph rail).
 *
 * Body (discriminated union on `action`):
 *   { action: 'approve' }
 *     PENDING → PROCESSING. Admin is signalling that the payout should go out.
 *     (The actual Graph API call to submit the payout is NOT done here — the
 *     first iteration is "admin presses approve, then admin manually processes
 *     the payout in Graph's dashboard, then admin marks it settled with the
 *     Graph reference". A future version will trigger Graph automatically on
 *     approve.)
 *
 *   { action: 'reject', rejectionReason: string (min 10 chars) }
 *     PENDING → FAILED. Records the reason.
 *     IMPORTANT: The user's balance is NOT automatically refunded. The admin
 *     must trigger a separate refund action once we have the ledger reversal
 *     helper built. The response returns refundRequired:true so the UI can
 *     flag this prominently.
 *
 *   { action: 'mark_settled', externalRef: string }
 *     PROCESSING → SETTLED. Records the Graph payout reference + settledAt.
 *
 * All three write an AdminAuditLog entry (admin_id → admin_users.id), never
 * user_audit_logs which FK's into users.id and would hit P2003 for admin
 * sessions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import { triggerGraphPayoutForWithdrawal } from '@/lib/graph-payout';

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    rejectionReason: z.string().min(10, 'Reason must be at least 10 characters'),
  }),
  z.object({
    action: z.literal('mark_settled'),
    externalRef: z
      .string()
      .min(1, 'External reference is required')
      .max(200, 'External reference too long'),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await prisma.withdrawal.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      provider: true,
      externalRef: true,
      transaction: {
        select: { initiatorUserId: true },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
  }

  const { action } = parsed.data;

  // ── Invariant checks: only allow legal state transitions ────────────────
  if (action === 'approve' && existing.status !== 'PENDING') {
    return NextResponse.json(
      {
        error: `Cannot approve: withdrawal is ${existing.status}, not PENDING.`,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }
  if (action === 'reject' && existing.status !== 'PENDING') {
    return NextResponse.json(
      {
        error: `Cannot reject: withdrawal is ${existing.status}, not PENDING.`,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }
  if (action === 'mark_settled' && existing.status !== 'PROCESSING') {
    return NextResponse.json(
      {
        error: `Cannot mark settled: withdrawal is ${existing.status}, not PROCESSING.`,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }

  // ── Apply the transition + audit log atomically ─────────────────────────
  let auditAction: string;
  let updated: { status: string; externalRef: string | null; failureReason: string | null };

  if (action === 'approve') {
    auditAction = 'WITHDRAWAL_APPROVED';
    const row = await prisma.$transaction(async (tx: any) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: { status: 'PROCESSING' },
        select: { status: true, externalRef: true, failureReason: true },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.userId,
          action: auditAction,
          resourceType: 'Withdrawal',
          resourceId: id,
          targetUserId: existing.transaction.initiatorUserId ?? null,
          metadata: { previousStatus: existing.status },
        },
      });
      return w;
    });
    updated = row;
  } else if (action === 'reject') {
    auditAction = 'WITHDRAWAL_REJECTED';
    const { rejectionReason } = parsed.data;
    const row = await prisma.$transaction(async (tx: any) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: { status: 'FAILED', failureReason: rejectionReason },
        select: { status: true, externalRef: true, failureReason: true },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.userId,
          action: auditAction,
          resourceType: 'Withdrawal',
          resourceId: id,
          targetUserId: existing.transaction.initiatorUserId ?? null,
          metadata: { previousStatus: existing.status, rejectionReason },
        },
      });
      return w;
    });
    updated = row;
  } else {
    auditAction = 'WITHDRAWAL_MARKED_SETTLED';
    const { externalRef } = parsed.data;
    const row = await prisma.$transaction(async (tx: any) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: {
          status: 'SETTLED',
          externalRef,
          settledAt: new Date(),
        },
        select: { status: true, externalRef: true, failureReason: true },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.userId,
          action: auditAction,
          resourceType: 'Withdrawal',
          resourceId: id,
          targetUserId: existing.transaction.initiatorUserId ?? null,
          metadata: { previousStatus: existing.status, externalRef },
        },
      });
      return w;
    });
    updated = row;
  }

  logger.info(
    {
      withdrawalId: id,
      adminId: session.userId,
      action: auditAction,
      newStatus: updated.status,
    },
    'admin withdrawal review',
  );

  // ── Post-commit: trigger Graph payout on approve ────────────────────────
  // Fire AFTER the status change commits so the DB is the source of truth for
  // state. If Graph fails, the withdrawal stays PROCESSING with no externalRef
  // and the admin retries via mark_settled (manual) or a re-approve endpoint.
  let payoutResult: Awaited<ReturnType<typeof triggerGraphPayoutForWithdrawal>> | null = null;
  if (action === 'approve') {
    try {
      payoutResult = await triggerGraphPayoutForWithdrawal(id);
      if (!payoutResult.ok && !payoutResult.skipped) {
        logger.warn(
          { withdrawalId: id, error: payoutResult.error },
          'Graph auto-payout failed after admin approve; will need manual follow-up',
        );
      }
    } catch (err) {
      logger.error(
        { withdrawalId: id, err: err instanceof Error ? err.message : String(err) },
        'Unhandled error dispatching Graph payout post-approve',
      );
      payoutResult = { ok: false, error: 'Unexpected error firing Graph payout' };
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    status: updated.status,
    externalRef: updated.externalRef,
    failureReason: updated.failureReason,
    refundRequired: action === 'reject',
    ...(payoutResult
      ? {
          graphPayout: {
            ok: payoutResult.ok,
            payoutId: payoutResult.payoutId ?? null,
            destinationId: payoutResult.destinationId ?? null,
            skipped: payoutResult.skipped ?? false,
            error: payoutResult.error ?? null,
          },
        }
      : {}),
  });
}
