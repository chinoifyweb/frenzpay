/**
 * GET /api/kyc
 * Returns the authenticated user's current KYC tier, status, pending
 * submission (if any), and tier limits.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { KYC_TIER_LIMITS, type KycTierValue } from '@frenzpay/kyc';

export async function GET() {
  const { session } = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      kycTier: true,
      kycStatus: true,
      frenzTag: { select: { tag: true, isVerified: true } },
      kycSubmissions: {
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, tier: true, status: true, submittedAt: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tier = user.kycTier as KycTierValue;
  const pendingSubmission = user.kycSubmissions[0] ?? null;

  return NextResponse.json({
    tier,
    kycStatus: user.kycStatus,
    frenzTag: user.frenzTag?.tag ?? null,
    frenzTagVerified: user.frenzTag?.isVerified ?? false,
    pendingSubmission: pendingSubmission
      ? {
          id: pendingSubmission.id,
          tier: pendingSubmission.tier as KycTierValue,
          status: pendingSubmission.status,
          submittedAt: pendingSubmission.submittedAt.toISOString(),
        }
      : null,
    limits: KYC_TIER_LIMITS[tier],
  });
}
