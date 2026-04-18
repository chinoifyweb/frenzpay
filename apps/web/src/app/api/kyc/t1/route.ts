/**
 * POST /api/kyc/t1
 * Submit KYC T1 (BVN + full legal name).
 *
 * Flow:
 * 1. Validate payload (full name, BVN format)
 * 2. Ensure user is T0 with no pending T1 submission
 * 3. Encrypt BVN + store HMAC blind index for deduplication
 * 4. If DOJAH_APP_ID is set → auto-verify via Dojah; on success, advance to T1
 * 5. Otherwise → queue PENDING for manual admin review
 * 6. Write AuditLog entry
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { encryptField, blindIndex } from '@frenzpay/crypto';
import { isValidBvnFormat, canSubmitForTier } from '@frenzpay/kyc';
import { verifyBvn } from '@frenzpay/kyc/dojah';

const T1Schema = z.object({
  fullLegalName: z
    .string()
    .min(3, 'Full legal name must be at least 3 characters')
    .max(200, 'Full legal name too long')
    .regex(/^[a-zA-Z\s\-'.]+$/, 'Name may only contain letters, spaces, hyphens, apostrophes'),
  bvn: z
    .string()
    .regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  // ── Parse & validate ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = T1Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { fullLegalName, bvn } = parsed.data;

  if (!isValidBvnFormat(bvn)) {
    return NextResponse.json({ error: 'Invalid BVN format' }, { status: 422 });
  }

  // ── Check user eligibility ──────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      kycTier: true,
      kycStatus: true,
      kycSubmissions: {
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        take: 1,
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const tierCheck = canSubmitForTier(user.kycTier as 'T0' | 'T1' | 'T2' | 'T3', 'T1');
  if (!tierCheck.allowed) {
    return NextResponse.json({ error: tierCheck.reason }, { status: 409 });
  }

  if (user.kycSubmissions.length > 0) {
    return NextResponse.json(
      { error: 'A T1 submission is already pending review.' },
      { status: 409 },
    );
  }

  // ── BVN deduplication via blind index ──────────────────────────────────────
  const bvnBlindIndex = blindIndex(bvn);

  const existingBvn = await prisma.kycSubmission.findFirst({
    where: { bvnBlindIndex },
    select: { userId: true },
  });

  if (existingBvn && existingBvn.userId !== session.userId) {
    return NextResponse.json(
      { error: 'This BVN is already associated with another account.' },
      { status: 409 },
    );
  }

  // ── Encrypt BVN & name (encryptField reads FIELD_ENCRYPTION_KEY from env) ────
  const encryptedBvn = encryptField(bvn, session.userId);
  const encryptedName = encryptField(fullLegalName, session.userId);

  // ── Try Dojah auto-verify ───────────────────────────────────────────────────
  let autoApproved = false;
  let dojahResult: { verified: boolean; firstName?: string; lastName?: string } | null = null;

  try {
    dojahResult = await verifyBvn(bvn, session.userId);
    autoApproved = dojahResult.verified;
  } catch (err) {
    console.error('[kyc/t1] Dojah BVN verify failed:', err);
    // Fall through to manual review
  }

  // ── Persist submission + advance tier if auto-approved ─────────────────────
  const result = await prisma.$transaction(async (tx: any) => {
    const submission = await tx.kycSubmission.create({
      data: {
        userId: session.userId,
        tier: 'T1',
        status: autoApproved ? 'APPROVED' : 'PENDING',
        provider: process.env['DOJAH_APP_ID'] ? 'dojah' : 'manual',
        fullLegalName: encryptedName,
        bvn: encryptedBvn,
        bvnBlindIndex,
        reviewedAt: autoApproved ? new Date() : null,
      },
    });

    if (autoApproved) {
      await tx.user.update({
        where: { id: session.userId },
        data: { kycTier: 'T1', kycStatus: 'APPROVED', status: 'ACTIVE' },
      });
    } else {
      await tx.user.update({
        where: { id: session.userId },
        data: { kycStatus: 'PENDING_REVIEW' },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: autoApproved ? 'KYC_T1_AUTO_APPROVED' : 'KYC_T1_SUBMITTED',
        resourceType: 'KycSubmission',
        resourceId: submission.id,
        metadata: { provider: submission.provider, autoApproved },
      },
    });

    return submission;
  });

  return NextResponse.json(
    {
      submissionId: result.id,
      status: result.status,
      autoApproved,
      message: autoApproved
        ? 'BVN verified successfully. You are now T1 Verified!'
        : 'Submission received. Our team will review within 1–2 business days.',
    },
    { status: 201 },
  );
}
