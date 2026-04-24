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
import { syncUserToGraph, uploadKycDocsToGraph } from '@/lib/graph-sync';
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

  // ── Post-commit: provision external-provider records ─────────────────────
  //
  // Two independent rails get primed here:
  //   1. Bridge — USDC settlement (USD/EUR → USDC). Creates a Bridge Customer
  //      identity record only, no virtual account.
  //   2. Graph — NGN settlement (USD/EUR → NGN). Creates a Graph Person and
  //      pushes the KYC documents we already hold. No bank_account yet.
  //
  // After this step the customer can activate per-currency accounts from
  // /dashboard/wallet — our account activation endpoint then issues the
  // appropriate Bridge virtual account or Graph bank_account depending on
  // which rail they chose.
  //
  // Each rail is independent: if Graph fails, Bridge can still succeed and
  // vice versa. Any failures are logged + returned in the response so the
  // admin knows to retry; they never block the KYC approval itself.
  let bridgeResult: Awaited<ReturnType<typeof ensureBridgeCustomer>> | null = null;
  let graphResult: Awaited<ReturnType<typeof syncUserToGraph>> | null = null;
  let graphDocResult: Awaited<ReturnType<typeof uploadKycDocsToGraph>> | null = null;

  if (action === 'approve' && (submission.tier === 'T2' || submission.tier === 'T3')) {
    // Bridge (independent of Graph failures)
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

    // Graph — Person + KYC documents. Fire both sequentially because docs
    // need the person id to attach to. Fire-and-forget the docs step after
    // the sync so we respond quickly even if Graph is slow on the upload.
    try {
      graphResult = await syncUserToGraph(submission.userId);
      if (graphResult.ok && graphResult.graphPersonId) {
        // Kick off doc upload — non-blocking, log failures for ops
        void uploadKycDocsToGraph(submission.id)
          .then((r) => {
            graphDocResult = r;
            if (!r.ok) {
              logger.warn(
                { userId: submission.userId, failures: r.failures.length, uploaded: r.uploaded.length },
                'Graph KYC doc upload had failures',
              );
            } else {
              logger.info(
                { userId: submission.userId, uploaded: r.uploaded.length },
                'Graph KYC docs uploaded',
              );
            }
          })
          .catch((err) =>
            logger.error(
              { userId: submission.userId, err: err instanceof Error ? err.message : err },
              'Graph KYC doc upload threw',
            ),
          );
      } else {
        logger.warn(
          { userId: submission.userId, error: graphResult.error },
          'Graph Person sync failed post-KYC; ops can retry',
        );
      }
    } catch (err) {
      logger.error(
        { userId: submission.userId, err: err instanceof Error ? err.message : String(err) },
        'Unhandled error during Graph Person sync post-KYC',
      );
      graphResult = {
        ok: false,
        error: 'Unexpected error syncing to Graph',
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
    ...(graphResult
      ? {
          graph: {
            ok: graphResult.ok,
            personCreated: graphResult.created ?? false,
            graphPersonId: graphResult.graphPersonId ?? null,
            error: graphResult.error ?? null,
          },
        }
      : {}),
  });
}
