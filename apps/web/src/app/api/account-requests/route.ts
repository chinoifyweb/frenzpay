/**
 * Customer endpoints for the manual virtual-account application flow.
 *
 * Replaces the previous "auto-provision after KYC" behaviour. After KYC
 * approval the customer is verified but has no virtual accounts; they
 * have to apply for each currency they want, and an admin manually
 * approves before any Bridge / Graph virtual account is created.
 *
 * GET  /api/account-requests
 *   Returns the requesting user's full request history (any status).
 *   Used by the dashboard to render the "Pending review" / "Approved"
 *   / "Apply for USD account" cards.
 *
 * POST /api/account-requests
 *   Creates a new PENDING request. Body collects step 2 of the
 *   wizard — sourceOfFunds, purpose, expectedMonthlyInflowCents.
 *   Step 1 of the wizard is just the customer confirming their legal
 *   name (already on record from KYC), so it doesn't post anything
 *   new. Step 3 is the success state.
 *
 *   Constraints enforced server-side (and by a partial unique index
 *   on the table):
 *     - Customer must be KYC T2+ (verified)
 *     - Currency must be one of USD / EUR / NGN
 *     - At most one PENDING request per (user, currency)
 *     - Customer can't request a currency they already have an
 *       APPROVED virtual account for (idempotent — return existing)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import { sendAdminAccountRequestNotification } from '@/lib/email';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'NGN'] as const;

// Step-2 enums match the KYC form so admins see consistent values
// across pages.
const PURPOSES = new Set([
  'personal', 'freelance', 'amazon_kdp', 'amazon_associates', 'upwork',
  'youtube', 'content_creator', 'dropshipping', 'saas', 'crypto_trading',
  'investment', 'remittance', 'business', 'ecommerce', 'other',
]);
const SOURCES = new Set([
  'salary', 'freelance', 'amazon_kdp', 'upwork', 'toptal', 'youtube',
  'patreon', 'ecommerce', 'dropshipping', 'saas', 'consulting', 'crypto',
  'investments', 'business', 'savings', 'gift', 'other',
]);

const PostSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  sourceOfFunds: z.string().refine((v) => SOURCES.has(v), 'Pick a valid source of funds'),
  purpose: z.string().refine((v) => PURPOSES.has(v), 'Pick a valid purpose'),
  // Cents — mirrors the KYC form's bands (50000 / 500000 / 1000000 / 1000001+)
  expectedMonthlyInflowCents: z.number().int().min(0).max(10_000_000_000),
});

export async function GET() {
  const { session } = await requireSession();

  const rows = await prisma.accountRequest.findMany({
    where: { userId: session.userId },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      currency: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      rejectionReasonCode: true,
      externalAccountId: true,
    },
  });

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requests: rows.map((r: any) => ({
      id: r.id,
      currency: r.currency,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason,
      rejectionReasonCode: r.rejectionReasonCode,
      externalAccountId: r.externalAccountId,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { currency, sourceOfFunds, purpose, expectedMonthlyInflowCents } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, status: true, kycTier: true,
      email: true, firstName: true, lastName: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
  }
  if (user.kycTier !== 'T2' && user.kycTier !== 'T3') {
    return NextResponse.json(
      { error: 'Complete KYC verification before requesting a virtual account.' },
      { status: 403 },
    );
  }

  // Idempotency: if there's already a PENDING (or PROCESSING — admin
  // is actively approving) request for this currency, return it
  // instead of creating a duplicate.
  const existingPending = await prisma.accountRequest.findFirst({
    where: { userId: user.id, currency, status: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true, status: true, submittedAt: true },
  });
  if (existingPending) {
    return NextResponse.json({
      ok: true,
      alreadyPending: true,
      request: {
        id: existingPending.id,
        currency,
        status: existingPending.status,
        submittedAt: existingPending.submittedAt.toISOString(),
      },
    });
  }

  // Idempotency: if there's already an APPROVED request, no need to apply.
  const existingApproved = await prisma.accountRequest.findFirst({
    where: { userId: user.id, currency, status: 'APPROVED' },
    select: { id: true, externalAccountId: true },
  });
  if (existingApproved) {
    return NextResponse.json(
      {
        error: `You already have an approved ${currency} account.`,
        externalAccountId: existingApproved.externalAccountId,
      },
      { status: 409 },
    );
  }

  const created = await prisma.accountRequest.create({
    data: {
      userId: user.id,
      currency,
      status: 'PENDING',
      sourceOfFunds,
      purpose,
      expectedMonthlyInflowCents: BigInt(expectedMonthlyInflowCents),
    },
    select: { id: true, status: true, submittedAt: true },
  });

  logger.info(
    { userId: user.id, requestId: created.id, currency },
    'account request submitted',
  );

  // Out-of-band: notify ops by email so they can review in /admin/account-requests.
  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  void sendAdminAccountRequestNotification(displayName, user.email, currency).catch((err) =>
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'admin account-request email notify failed',
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      request: {
        id: created.id,
        currency,
        status: created.status,
        submittedAt: created.submittedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
