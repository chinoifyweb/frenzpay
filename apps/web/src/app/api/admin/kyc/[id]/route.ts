/**
 * PATCH /api/admin/kyc/[id]
 * Approve or reject a KYC submission.
 *
 * Body: { action: 'approve' | 'reject', rejectionReason?: string }
 *
 * On approve: advances user.kycTier to the submitted tier
 * On reject:  sets user.kycStatus = 'REJECTED', stores reason
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { ensureBridgeCustomer } from '@/lib/bridge-provision';
import { logger } from '@frenzpay/logger';
import { sendKYCApprovedEmail, sendKYCRejectedEmail } from '@/lib/email';

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), rejectionReason: z.string().min(10, 'Please provide a reason (min 10 chars)') }),
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

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const submission = await prisma.kycSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      tier: true,
      status: true,
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  if (!['PENDING', 'PROCESSING'].includes(submission.status)) {
    return NextResponse.json(
      { error: 'Submission is not in a reviewable state.' },
      { status: 409 },
    );
  }

  const { action } = parsed.data;
  const now = new Date();

  await prisma.$transaction(async (tx: any) => {
    if (action === 'approve') {
      await tx.kycSubmission.update({
        where: { id },
        data: { status: 'APPROVED', reviewedAt: now, reviewedBy: session.userId },
      });

      await tx.user.update({
        where: { id: submission.userId },
        data: {
          kycTier: submission.tier,
          kycStatus: 'APPROVED',
          status: 'ACTIVE',
        },
      });
    } else {
      const { rejectionReason } = parsed.data as { action: 'reject'; rejectionReason: string };
      await tx.kycSubmission.update({
        where: { id },
        data: { status: 'REJECTED', reviewedAt: now, reviewedBy: session.userId, rejectionReason },
      });

      await tx.user.update({
        where: { id: submission.userId },
        data: { kycStatus: 'REJECTED' },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: action === 'approve' ? 'ADMIN_KYC_APPROVED' : 'ADMIN_KYC_REJECTED',
        resourceType: 'KycSubmission',
        resourceId: id,
        metadata: {
          submissionUserId: submission.userId,
          tier: submission.tier,
          ...(action === 'reject'
            ? { rejectionReason: (parsed.data as any).rejectionReason }
            : {}),
        },
      },
    });
  });

  // ── Notify the customer by email (best-effort) ─────────────────────────────
  const displayName =
    `${submission.user.firstName ?? ''} ${submission.user.lastName ?? ''}`.trim() ||
    submission.user.email;
  if (action === 'approve') {
    void sendKYCApprovedEmail(submission.user.email, displayName).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : err }, 'KYC approved email failed'),
    );
  } else {
    const { rejectionReason } = parsed.data as { action: 'reject'; rejectionReason: string };
    void sendKYCRejectedEmail(submission.user.email, displayName, rejectionReason).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : err }, 'KYC rejected email failed'),
    );
  }

  // ── Post-commit: create Bridge customer on T2+ approval ────────────────────
  // We only create the Bridge customer record here (identity-level), NOT a
  // virtual account. The user then picks which currency to activate (USD /
  // EUR / …) themselves from /dashboard/wallet, and the per-currency
  // virtual account is provisioned at that point via /api/accounts/activate.
  // This keeps the customer in control of which rails they want and avoids
  // creating USD accounts for users who only care about EUR (or vice versa).
  let bridgeResult: Awaited<ReturnType<typeof ensureBridgeCustomer>> | null = null;
  if (action === 'approve' && (submission.tier === 'T2' || submission.tier === 'T3')) {
    try {
      bridgeResult = await ensureBridgeCustomer(submission.userId, {
        triggeredBy: 'admin',
        adminId: session.userId,
      });
      if (!bridgeResult.ok) {
        logger.warn(
          { userId: submission.userId, bridgeError: bridgeResult.error },
          'KYC approved but Bridge customer creation failed; ops can retry',
        );
      } else {
        logger.info(
          { userId: submission.userId, customerCreated: bridgeResult.created },
          'KYC approved; Bridge customer ready for currency activation',
        );
      }
    } catch (err) {
      logger.error(
        { userId: submission.userId, err: err instanceof Error ? err.message : String(err) },
        'Unhandled error during Bridge customer creation post-KYC',
      );
      bridgeResult = {
        ok: false,
        created: false,
        error: 'Unexpected error creating Bridge customer',
      };
    }
  }

  return NextResponse.json({
    message: action === 'approve' ? 'KYC submission approved.' : 'KYC submission rejected.',
    status: action === 'approve' ? 'APPROVED' : 'REJECTED',
    ...(bridgeResult
      ? {
          bridge: {
            ok: bridgeResult.ok,
            customerCreated: bridgeResult.created,
            error: bridgeResult.error ?? null,
          },
        }
      : {}),
  });
}
