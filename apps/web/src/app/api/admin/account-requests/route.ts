/**
 * GET /api/admin/account-requests
 *
 * Paginated queue of customer virtual-account requests for admin review.
 * Filterable by status (defaults to PENDING) and currency.
 *
 * Returns enough context for the admin reviewer to decide approve/reject
 * without a second round-trip — customer name + email + KYC tier + the
 * step-2 wizard payload (sourceOfFunds, purpose, expectedMonthlyInflow).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

const VALID_STATUSES = new Set(['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED']);
const VALID_CURRENCIES = new Set(['USD', 'EUR', 'NGN']);

export async function GET(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'PENDING';
  const currency = searchParams.get('currency');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status !== 'ALL' && VALID_STATUSES.has(status)) where.status = status;
  if (currency && VALID_CURRENCIES.has(currency)) where.currency = currency;

  const [rows, total] = await Promise.all([
    prisma.accountRequest.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        currency: true,
        status: true,
        sourceOfFunds: true,
        purpose: true,
        expectedMonthlyInflowCents: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        rejectionReasonCode: true,
        externalAccountId: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycTier: true,
            country: true,
            // Selected just to expose `hasDob` to the admin UI — the
            // actual ciphertext doesn't leave this server. Used to show
            // an inline "Set DOB" form on the review modal so the
            // admin can backfill it before approving (Graph rejects
            // provisioning when User.dob is null).
            dob: true,
          },
        },
      },
    }),
    prisma.accountRequest.count({ where }),
  ]);

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests: rows.map((r: any) => ({
      id: r.id,
      currency: r.currency,
      status: r.status,
      sourceOfFunds: r.sourceOfFunds,
      purpose: r.purpose,
      expectedMonthlyInflowCents: r.expectedMonthlyInflowCents?.toString() ?? null,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason,
      rejectionReasonCode: r.rejectionReasonCode,
      externalAccountId: r.externalAccountId,
      user: {
        id: r.user.id,
        email: r.user.email,
        displayName: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email,
        kycTier: r.user.kycTier,
        country: r.user.country,
        // Coerce to plain bool so we don't leak the ciphertext.
        hasDob: r.user.dob !== null && r.user.dob !== undefined,
      },
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}
