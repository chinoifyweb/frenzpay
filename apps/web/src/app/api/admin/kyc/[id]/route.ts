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
import { logger } from '@frenzpay/logger';
import { sendKYCApprovedEmail, sendKYCRejectedEmail } from '@/lib/email';
import { findRejectionTemplate } from '@/lib/kyc-rejection-templates';

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    // Customer-facing message — required, min 10 chars whether the admin
    // picked a template or wrote it freeform.
    rejectionReason: z.string().min(10, 'Please provide a reason (min 10 chars)'),
    // Optional template code so we can group rejections analytically and
    // so the customer email + dashboard renders the matching action
    // checklist. Pass `'OTHER'` for fully custom reasons.
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
      const { rejectionReason, rejectionReasonCode } = parsed.data as {
        action: 'reject';
        rejectionReason: string;
        rejectionReasonCode?: string;
      };
      // Store the template code in metadata so /api/kyc can render the
      // matching action checklist for the customer. The freeform text
      // continues to live in the dedicated rejectionReason column.
      await tx.kycSubmission.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedAt: now,
          reviewedBy: session.userId,
          rejectionReason,
          rejectionReasonCode: rejectionReasonCode ?? null,
        },
      });

      await tx.user.update({
        where: { id: submission.userId },
        data: { kycStatus: 'REJECTED' },
      });
    }

    // adminAuditLog (not auditLog) — session.userId is an AdminUser.id and
    // would FK-fail against the customer-side audit_logs.user_id column.
    // The "Confirm rejection" button on /admin/kyc was 500ing on this for
    // every reviewer; same FK pattern we fixed earlier on the KYC document
    // viewer + admin transaction-refund routes.
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: action === 'approve' ? 'ADMIN_KYC_APPROVED' : 'ADMIN_KYC_REJECTED',
        resourceType: 'KycSubmission',
        resourceId: id,
        targetUserId: submission.userId,
        metadata: {
          tier: submission.tier,
          ...(action === 'reject'
            ? {
                rejectionReason: (parsed.data as { rejectionReason?: string }).rejectionReason,
                rejectionReasonCode: (parsed.data as { rejectionReasonCode?: string }).rejectionReasonCode ?? null,
              }
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
    const { rejectionReason, rejectionReasonCode } = parsed.data as {
      action: 'reject';
      rejectionReason: string;
      rejectionReasonCode?: string;
    };
    // Render structured actions in the email when the admin picked a
    // template (anything other than OTHER). For OTHER / freeform the email
    // falls back to a generic "resubmit through your dashboard" line.
    const template = findRejectionTemplate(rejectionReasonCode);
    const actions = template?.actions ?? [];
    void sendKYCRejectedEmail(submission.user.email, displayName, rejectionReason, actions).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : err }, 'KYC rejected email failed'),
    );
  }

  // No more auto-provisioning on KYC approval.
  //
  // Previously the approve branch fired ensureBridgeCustomer + syncUserToGraph
  // + uploadKycDocsToGraph here so the customer could `/api/accounts/activate`
  // a virtual account immediately. That short-circuited compliance review of
  // each rail (Graph wants a fresh purpose+source-of-funds for a USD account
  // that isn't necessarily the same as what was captured at KYC). Now KYC
  // approval only changes the user's tier; the customer applies separately
  // for each currency via /api/account-requests, and the Bridge / Graph
  // calls happen inside /api/admin/account-requests/[id] PATCH on approve.

  return NextResponse.json({
    message: action === 'approve' ? 'KYC submission approved.' : 'KYC submission rejected.',
    status: action === 'approve' ? 'APPROVED' : 'REJECTED',
  });
}
