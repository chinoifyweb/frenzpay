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

  return NextResponse.json({
    message: action === 'approve' ? 'KYC submission approved.' : 'KYC submission rejected.',
    status: action === 'approve' ? 'APPROVED' : 'REJECTED',
  });
}
