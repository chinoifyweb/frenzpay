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
import { provisionBridgeForUser } from '@/lib/bridge-provision';
import { logger } from '@frenzpay/logger';

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
    select: { id: true, userId: true, tier: true, status: true },
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

  // ── Post-commit: auto-provision Bridge on T2+ approval ─────────────────────
  // Bridge's virtual USD account + USDC custody requires Advanced KYC (T2 on
  // our tier system), so we only trigger provisioning when the admin has
  // approved at that level or higher. Failure here does NOT revert the tier
  // bump — the user is still T2 in our books, but ops can retry provisioning
  // from the admin "Users" panel. We surface the outcome in the response so
  // the admin UI can show a warning toast if Bridge was down.
  let bridgeResult: Awaited<ReturnType<typeof provisionBridgeForUser>> | null = null;
  if (action === 'approve' && (submission.tier === 'T2' || submission.tier === 'T3')) {
    try {
      bridgeResult = await provisionBridgeForUser(submission.userId, {
        triggeredBy: 'admin',
        adminId: session.userId,
      });
      if (!bridgeResult.ok) {
        logger.warn(
          { userId: submission.userId, bridgeError: bridgeResult.error },
          'KYC approved but Bridge onboarding failed; ops can retry',
        );
      } else {
        logger.info(
          { userId: submission.userId, created: bridgeResult.created },
          'KYC approved and Bridge onboarding completed',
        );
      }
    } catch (err) {
      // Extra belt for unexpected errors — the helper swallows its own, but just in case.
      logger.error(
        { userId: submission.userId, err: err instanceof Error ? err.message : String(err) },
        'Unhandled error during Bridge provisioning post-KYC',
      );
      bridgeResult = {
        ok: false,
        created: { customer: false, virtualAccount: false },
        error: 'Unexpected error during Bridge provisioning',
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
            customerCreated: bridgeResult.created.customer,
            virtualAccountCreated: bridgeResult.created.virtualAccount,
            error: bridgeResult.error ?? null,
          },
        }
      : {}),
  });
}
