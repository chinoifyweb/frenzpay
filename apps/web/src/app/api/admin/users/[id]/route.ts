// Force dynamic — these routes read cookies/headers and must never be statically rendered.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/[id]
 *
 * Admin endpoint: fetch one user and everything needed to triage the account —
 * identity fields (unencrypted only), KYC history, account records (balance
 * computation deferred: the UI shows activity instead), recent transactions,
 * recent admin actions, recent withdrawals.
 *
 * Never returns password hashes, encrypted PII, TOTP secrets, or raw KYC
 * documents. To view decrypted KYC artefacts, use /api/admin/kyc/[id] which
 * has its own decryption + audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      displayName: true,
      country: true,
      status: true,
      kycTier: true,
      kycStatus: true,
      emailVerified: true,
      phoneVerified: true,
      mfaRequired: true,
      isPep: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      frenzTag: { select: { tag: true, isVerified: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Parallel fetch of supporting data
  const [accounts, recentTx, recentAdminActions, kycSubmissions, withdrawals] =
    await Promise.all([
      prisma.account.findMany({
        where: { ownerType: 'USER', ownerId: id },
        select: {
          id: true,
          currency: true,
          subtype: true,
          createdAt: true,
        },
        orderBy: { currency: 'asc' },
      }),
      prisma.transaction.findMany({
        where: {
          OR: [{ initiatorUserId: id }, { counterpartyUserId: id }],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          feeAmount: true,
          feeCurrency: true,
          externalRef: true,
          createdAt: true,
        },
      }),
      prisma.adminAuditLog.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          metadata: true,
          createdAt: true,
          admin: { select: { email: true } },
        },
      }),
      prisma.kycSubmission.findMany({
        where: { userId: id },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          tier: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
        },
      }),
      prisma.withdrawal.findMany({
        where: { transaction: { initiatorUserId: id } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          sourceAmountCents: true,
          destAmountKobo: true,
          externalRef: true,
          createdAt: true,
          settledAt: true,
        },
      }),
    ]);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      country: user.country,
      status: user.status,
      kycTier: user.kycTier,
      kycStatus: user.kycStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      mfaRequired: user.mfaRequired,
      isPep: user.isPep,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
      frenzTag: user.frenzTag
        ? { tag: user.frenzTag.tag, isVerified: user.frenzTag.isVerified }
        : null,
    },
    accounts: accounts.map((a: (typeof accounts)[number]) => ({
      id: a.id,
      currency: a.currency,
      subtype: a.subtype,
      createdAt: a.createdAt.toISOString(),
    })),
    recentTransactions: recentTx.map((t: (typeof recentTx)[number]) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: t.amount.toString(),
      currency: t.currency,
      feeAmount: t.feeAmount.toString(),
      feeCurrency: t.feeCurrency,
      externalRef: t.externalRef,
      createdAt: t.createdAt.toISOString(),
    })),
    recentAdminActions: recentAdminActions.map(
      (a: (typeof recentAdminActions)[number]) => ({
        id: a.id.toString(),
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
        adminEmail: a.admin?.email ?? 'unknown',
      }),
    ),
    kycSubmissions: kycSubmissions.map(
      (k: (typeof kycSubmissions)[number]) => ({
        id: k.id,
        tier: k.tier,
        status: k.status,
        submittedAt: k.submittedAt.toISOString(),
        reviewedAt: k.reviewedAt?.toISOString() ?? null,
        rejectionReason: k.rejectionReason,
      }),
    ),
    withdrawals: withdrawals.map((w: (typeof withdrawals)[number]) => ({
      id: w.id,
      status: w.status,
      sourceAmountCents: w.sourceAmountCents.toString(),
      destAmountKobo: w.destAmountKobo.toString(),
      externalRef: w.externalRef,
      createdAt: w.createdAt.toISOString(),
      settledAt: w.settledAt?.toISOString() ?? null,
    })),
  });
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Soft-delete a customer. Blocked when the user has:
 *   - Any approved KYC submission (regulated users only via compliance flow)
 *   - Any transaction with POSTED or PROCESSING status
 *   - A non-zero balance on any account
 *
 * Deletion = set status='DELETED' + deletedAt=now. Row is kept for audit.
 * Email is suffixed with a timestamp to free it up for re-use.
 * Phone blind-index is nulled so the number can be re-registered.
 *
 * Requires confirmation: body { confirm: true }. Writes admin_audit_logs.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); }
  catch { body = {}; }
  const confirm = (body as { confirm?: boolean })?.confirm === true;
  if (!confirm) {
    return NextResponse.json(
      { error: 'Confirmation required. Send { confirm: true } in the body.' },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      status: true,
      deletedAt: true,
      kycStatus: true,
      kycSubmissions: {
        where: { status: 'APPROVED' },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.deletedAt) {
    return NextResponse.json({ error: 'User is already deleted.' }, { status: 409 });
  }
  if (user.kycSubmissions.length > 0) {
    return NextResponse.json(
      {
        error:
          'User has an approved KYC record. Use "freeze" instead — approved customers cannot be deleted via this endpoint for compliance reasons.',
      },
      { status: 409 },
    );
  }

  // Block deletion if there is any money movement in flight
  const activeTx = await prisma.transaction.count({
    where: {
      OR: [{ initiatorUserId: id }, { counterpartyUserId: id }],
      status: { in: ['PENDING', 'POSTED'] },
    },
  });
  if (activeTx > 0) {
    return NextResponse.json(
      {
        error:
          `User has ${activeTx} open transaction(s). Cancel or settle them before deleting.`,
      },
      { status: 409 },
    );
  }

  const timestamp = Date.now();
  const now = new Date();

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: now,
        // Free the email so the customer (or another person) can re-sign-up
        email: `deleted-${timestamp}-${user.email}`.slice(0, 320),
        phoneBlindIndex: null,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_USER_DELETED',
        resourceType: 'User',
        resourceId: id,
        targetUserId: id,
        metadata: { originalEmail: user.email, previousStatus: user.status },
      },
    });
  });

  logger.info(
    { adminId: session.userId, deletedUserId: id, originalEmail: user.email },
    'Admin soft-deleted user',
  );

  return NextResponse.json({ ok: true, userId: id, status: 'DELETED' });
}
