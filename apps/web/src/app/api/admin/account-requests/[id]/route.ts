/**
 * PATCH /api/admin/account-requests/[id]
 *
 * Approve or reject a customer virtual-account request.
 *
 * Body:
 *   { action: 'approve' }
 *   { action: 'reject', rejectionReason: string, rejectionReasonCode?: string }
 *
 * On approve:
 *   - Picks the right rail (graph for NGN + USD-from-NG, bridge otherwise)
 *   - Calls the existing ensureBridgeCustomer / ensureBridgeVirtualAccount
 *     or ensureGraphBankAccount provisioner — same code that used to
 *     auto-fire on KYC approval, just now gated behind admin review
 *   - Marks the request APPROVED with externalAccountId pointing at the
 *     freshly-issued UserExternalAccount row
 *   - Emails the customer "your X account is ready"
 *   - Logs an admin_audit_logs entry
 *
 * On reject:
 *   - Stores rejection reason + code, marks REJECTED, emails the customer.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import { ensureBridgeCustomer, ensureBridgeVirtualAccount } from '@/lib/bridge-provision';
import { ensureGraphBankAccount } from '@/lib/graph-provision';
import { syncUserToGraph, uploadKycDocsToGraph } from '@/lib/graph-sync';
import {
  sendAccountRequestApprovedEmail,
  sendAccountRequestRejectedEmail,
} from '@/lib/email';

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    rejectionReason: z.string().min(10, 'Reason must be at least 10 characters'),
    rejectionReasonCode: z.string().max(64).optional(),
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
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const request = await prisma.accountRequest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      currency: true,
      status: true,
      user: {
        select: {
          id: true, email: true, firstName: true, lastName: true,
          country: true, kycTier: true, status: true, graphPersonId: true,
        },
      },
    },
  });
  if (!request) {
    return NextResponse.json({ error: 'Account request not found' }, { status: 404 });
  }
  if (request.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Request is already ${request.status}.` },
      { status: 409 },
    );
  }

  const displayName =
    `${request.user.firstName ?? ''} ${request.user.lastName ?? ''}`.trim() ||
    request.user.email;

  // ─────────────────────────────────────────── REJECT ────────────────────
  if (parsed.data.action === 'reject') {
    const { rejectionReason, rejectionReasonCode } = parsed.data;

    await prisma.$transaction(async (tx: any) => {
      await tx.accountRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason,
          rejectionReasonCode: rejectionReasonCode ?? null,
          reviewedAt: new Date(),
          reviewedBy: session.userId,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.userId,
          action: 'ADMIN_ACCOUNT_REQUEST_REJECTED',
          resourceType: 'AccountRequest',
          resourceId: id,
          targetUserId: request.userId,
          metadata: { currency: request.currency, rejectionReason, rejectionReasonCode },
        },
      });
    });

    void sendAccountRequestRejectedEmail(
      request.user.email,
      displayName,
      request.currency,
      rejectionReason,
    ).catch((err) =>
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        'account-request rejected email failed',
      ),
    );

    return NextResponse.json({ ok: true, status: 'REJECTED' });
  }

  // ─────────────────────────────────────────── APPROVE ───────────────────
  // Provisioning runs OUTSIDE the DB transaction so a long external HTTP
  // call can't hold a Postgres txn open. We mark the request APPROVED only
  // after the rail call succeeds.
  type Rail = 'bridge' | 'graph';
  let rail: Rail;
  if (request.currency === 'NGN') rail = 'graph';
  else if (request.currency === 'USD' && request.user.country === 'NG') rail = 'graph';
  else rail = 'bridge';

  let externalAccountId: string | null = null;
  let provisionError: string | null = null;

  try {
    if (rail === 'graph') {
      // Make sure the Graph person + KYC docs are synced. These are
      // idempotent for repeated calls.
      try {
        await syncUserToGraph(request.userId);
        await uploadKycDocsToGraph(request.userId).catch(() => null);
      } catch (err) {
        logger.warn(
          { userId: request.userId, err: err instanceof Error ? err.message : err },
          'Graph sync failed during account-request approval; continuing',
        );
      }

      const result = await ensureGraphBankAccount(
        request.userId,
        request.currency as 'USD' | 'EUR' | 'NGN',
        { triggeredBy: 'admin' },
      );
      if (!result.ok) {
        provisionError = result.error || 'Graph provisioning failed';
      } else {
        // ensureGraphBankAccount returns the *external* (rail-side) id;
        // we want the DB row id so the AccountRequest links correctly.
        const uea = await prisma.userExternalAccount.findFirst({
          where: { userId: request.userId, externalAccountId: result.virtualAccountId ?? '' },
          select: { id: true },
        });
        externalAccountId = uea?.id ?? null;
      }
    } else {
      // bridge — create the customer if needed, then the virtual account
      const customerResult = await ensureBridgeCustomer(request.userId, {
        triggeredBy: 'admin',
        adminId: session.userId,
      });
      if (!customerResult.ok) {
        provisionError = customerResult.error || 'Bridge customer creation failed';
      } else {
        const accountResult = await ensureBridgeVirtualAccount(
          request.userId,
          request.currency as 'USD' | 'EUR',
          { triggeredBy: 'admin', adminId: session.userId },
        );
        if (!accountResult.ok) {
          provisionError = accountResult.error || 'Bridge virtual account failed';
        } else {
          const uea = await prisma.userExternalAccount.findFirst({
            where: { userId: request.userId, externalAccountId: accountResult.virtualAccountId ?? '' },
            select: { id: true },
          });
          externalAccountId = uea?.id ?? null;
        }
      }
    }
  } catch (err) {
    provisionError = err instanceof Error ? err.message : String(err);
  }

  if (provisionError || !externalAccountId) {
    logger.error(
      { requestId: id, userId: request.userId, currency: request.currency, rail, provisionError },
      'account-request provisioning failed; request stays PENDING for retry',
    );
    return NextResponse.json(
      {
        error:
          'Provisioning failed: ' +
          (provisionError ?? 'no account id returned') +
          '. The request is still PENDING — fix the underlying issue and retry.',
      },
      { status: 502 },
    );
  }

  // Provisioning succeeded — flip the request to APPROVED.
  await prisma.$transaction(async (tx: any) => {
    await tx.accountRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: session.userId,
        externalAccountId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_ACCOUNT_REQUEST_APPROVED',
        resourceType: 'AccountRequest',
        resourceId: id,
        targetUserId: request.userId,
        metadata: { currency: request.currency, rail, externalAccountId },
      },
    });
  });

  void sendAccountRequestApprovedEmail(
    request.user.email,
    displayName,
    request.currency,
  ).catch((err) =>
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'account-request approved email failed',
    ),
  );

  logger.info(
    { requestId: id, userId: request.userId, currency: request.currency, rail, externalAccountId },
    'account request approved + provisioned',
  );

  return NextResponse.json({
    ok: true,
    status: 'APPROVED',
    externalAccountId,
  });
}
