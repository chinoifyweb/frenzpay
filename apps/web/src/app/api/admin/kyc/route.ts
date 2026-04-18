/**
 * GET /api/admin/kyc
 * List KYC submissions for admin review.
 * Query params: status (PENDING|PROCESSING|APPROVED|REJECTED), tier (T1|T2|T3), page, limit
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET(req: NextRequest) {
  const { session } = await requireSession();

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'PENDING';
  const tier = searchParams.get('tier');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  const where: any = {};
  if (['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(status)) {
    where.status = status;
  }
  if (tier && ['T1', 'T2', 'T3'].includes(tier)) {
    where.tier = tier;
  }

  const [submissions, total] = await Promise.all([
    prisma.kycSubmission.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        tier: true,
        status: true,
        provider: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycTier: true,
            kycStatus: true,
          },
        },
        documents: {
          select: {
            id: true,
            docType: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.kycSubmission.count({ where }),
  ]);

  return NextResponse.json({
    submissions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
