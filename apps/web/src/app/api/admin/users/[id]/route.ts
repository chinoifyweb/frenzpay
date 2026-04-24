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
        where: { ownerType: 'user', ownerId: id },
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
