/**
 * GET /api/kyc
 *
 * Returns the authenticated user's KYC tier + status, plus enough state
 * for the dashboard to render the right card:
 *
 *   - `pendingSubmission` — set when there's an in-flight PENDING /
 *     PROCESSING review. Tells the UI to show the "under review" card.
 *
 *   - `lastSubmission` — set whenever the user has *any* prior submission
 *     (regardless of status). The dashboard uses it for two things:
 *       * To show the rejection reason + action checklist when status
 *         is REJECTED, so customers see exactly what to fix.
 *       * To prefill the resubmit form with the customer's previously-
 *         entered fields (name, address, employment, etc) — encrypted
 *         PII is decrypted with the user's own context so they don't
 *         have to re-type after a rejection.
 *     `lastSubmission` is intentionally NOT returned once the user is
 *     APPROVED (kycTier ≥ T2): once verified, retaining the rejection
 *     paper-trail in the customer-visible payload is unnecessary and the
 *     KYC page just shows "Verified" anyway.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { decryptField, type CipherPayload } from '@frenzpay/crypto';
import { KYC_TIER_LIMITS, type KycTierValue } from '@frenzpay/kyc';
import { findRejectionTemplate } from '@/lib/kyc-rejection-templates';
import { logger } from '@frenzpay/logger';

/** Best-effort decrypt — returns null on any failure rather than throwing,
 *  so a single corrupted field can't blow up the whole /api/kyc response. */
function tryDecrypt(payload: unknown, ctx: string): string | null {
  if (!payload) return null;
  try { return decryptField(payload as CipherPayload, ctx); }
  catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'kyc field decrypt failed',
    );
    return null;
  }
}

export async function GET() {
  const { session } = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      kycTier: true,
      kycStatus: true,
      frenzTag: { select: { tag: true, isVerified: true } },
      // Pending review (if any)
      kycSubmissions: {
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, tier: true, status: true, submittedAt: true },
      },
      // Saved address bits live on the user row (encrypted) — used to
      // prefill the address section on resubmit.
      addressLine1: true,
      addressLine2: true,
      city: true,
      addressState: true,
      postalCode: true,
      dob: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tier = user.kycTier as KycTierValue;
  const pendingSubmission = user.kycSubmissions[0] ?? null;

  // Look up the most recent submission of any status — used for the
  // rejected-card state + form prefill.
  const lastRow = await prisma.kycSubmission.findFirst({
    where: { userId: session.userId },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      tier: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      rejectionReason: true,
      rejectionReasonCode: true,
      fullLegalName: true,
      bvn: true,
      nin: true,
      passportNumber: true,
      driverLicenseNumber: true,
      votersCardNumber: true,
      sourceOfFunds: true,
      purposeOfAccount: true,
      employmentStatus: true,
      occupation: true,
      expectedMonthlyInflowCents: true,
    },
  });

  // Build the prefill payload — decrypt only the fields the user is
  // going to need on the form. We decrypt with the user's own id as
  // the AAD context (encryptField was called with that). Any field
  // that fails to decrypt drops to null, which the form treats as
  // empty and the user re-enters.
  let lastSubmission: Record<string, unknown> | null = null;
  if (lastRow && tier !== 'T2' && tier !== 'T3') {
    const ctx = session.userId;
    const code = lastRow.rejectionReasonCode ?? null;
    const template = findRejectionTemplate(code);

    // docKind + docNumber are stored across three columns; collapse to a
    // single { docKind, docNumber } pair the form can prefill.
    let docKind: 'nin' | 'passport' | 'drivers_license' | 'voters_card' | null = null;
    let docNumber: string | null = null;
    if (lastRow.nin) {
      docKind = 'nin';
      docNumber = tryDecrypt(lastRow.nin, ctx);
    } else if (lastRow.passportNumber) {
      docKind = 'passport';
      docNumber = tryDecrypt(lastRow.passportNumber, ctx);
    } else if (lastRow.driverLicenseNumber) {
      docKind = 'drivers_license';
      docNumber = tryDecrypt(lastRow.driverLicenseNumber, ctx);
    } else if (lastRow.votersCardNumber) {
      docKind = 'voters_card';
      docNumber = tryDecrypt(lastRow.votersCardNumber, ctx);
    }

    lastSubmission = {
      id: lastRow.id,
      status: lastRow.status,
      submittedAt: lastRow.submittedAt.toISOString(),
      reviewedAt: lastRow.reviewedAt?.toISOString() ?? null,
      // Rejection details — null when status !== REJECTED
      rejectionReason: lastRow.status === 'REJECTED' ? lastRow.rejectionReason : null,
      rejectionReasonCode: lastRow.status === 'REJECTED' ? code : null,
      rejectionTemplate: lastRow.status === 'REJECTED' && template
        ? { code: template.code, customerMessage: template.customerMessage, actions: template.actions }
        : null,
      // Prefill payload — non-PII fields raw, PII fields decrypted in-place
      prefill: {
        docKind,
        docNumber,
        fullLegalName: tryDecrypt(lastRow.fullLegalName, ctx),
        bvn: tryDecrypt(lastRow.bvn, ctx),
        sourceOfFunds: lastRow.sourceOfFunds ?? null,
        purposeOfAccount: lastRow.purposeOfAccount ?? null,
        employmentStatus: lastRow.employmentStatus ?? null,
        occupation: lastRow.occupation ?? null,
        expectedMonthlyInflowCents:
          lastRow.expectedMonthlyInflowCents !== null
            ? lastRow.expectedMonthlyInflowCents.toString()
            : null,
        dob: tryDecrypt(user.dob, ctx),
        addressLine1: tryDecrypt(user.addressLine1, ctx),
        addressLine2: tryDecrypt(user.addressLine2, ctx),
        city: tryDecrypt(user.city, ctx),
        addressState: user.addressState ?? null,
        postalCode: tryDecrypt(user.postalCode, ctx),
      },
    };
  }

  // KYC_TIER_LIMITS values are BigInts (cents fit comfortably in 64-bit
  // signed but JSON can't serialise BigInt natively). Stringify each
  // field so the JSON response doesn't throw — the dashboard reads
  // them as strings and parses on display anyway.
  const rawLimits = KYC_TIER_LIMITS[tier];
  const limits = {
    depositDailyCents: rawLimits.depositDailyCents.toString(),
    withdrawDailyCents: rawLimits.withdrawDailyCents.toString(),
    balanceCapCents: rawLimits.balanceCapCents.toString(),
    p2pSendDailyCents: rawLimits.p2pSendDailyCents.toString(),
    p2pReceiveDailyCents: rawLimits.p2pReceiveDailyCents.toString(),
  };

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
    lastSubmission,
    limits,
  });
}
