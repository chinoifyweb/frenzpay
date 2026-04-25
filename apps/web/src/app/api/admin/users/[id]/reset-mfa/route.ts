/**
 * POST /api/admin/users/[id]/reset-mfa
 *
 * Admin operational reset of a customer's Google Authenticator. Used
 * when a customer has lost their phone / can no longer access their
 * authenticator AND has produced supporting documents (e.g. selfie
 * with ID, video call). The admin records what they verified in the
 * `documentsReviewed` + `reason` fields so there's a paper trail if
 * the reset later turns out to have been a social-engineering attempt.
 *
 * Body:
 *   { totpCode, reason, documentsReviewed }
 *     totpCode           — admin's own TOTP, gateAdminOp() validates it
 *     reason             — min 30 chars, what happened + how the
 *                          customer was identified
 *     documentsReviewed  — array of identifiers / labels
 *                          (e.g. ["selfie-with-ID via WhatsApp",
 *                          "live video call 2026-04-25"])
 *
 * Effects:
 *   - Active TOTP MfaSecret + backup_codes rows for the target user
 *     marked isActive=false, revokedAt=now
 *   - target.mfaRequired = false (login flow falls back to email OTP)
 *   - admin_audit_logs row + an email notification to the customer
 *     ("we've reset your authenticator at your request — log in and
 *     re-enrol from Security")
 *
 * Force-logout is NOT applied — letting the customer keep any active
 * sessions means they can immediately re-enrol.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { gateAdminOp } from '@/lib/admin-mfa';
import { logger } from '@frenzpay/logger';
import { sendCustomerMfaResetEmail } from '@/lib/email';

const Schema = z.object({
  totpCode: z.string().regex(/^\d{6}$/),
  reason: z.string().min(30, 'Describe what was verified in at least 30 characters').max(1000),
  documentsReviewed: z
    .array(z.string().min(2).max(200))
    .min(1, 'List at least one document or verification step')
    .max(10),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireRole('admin');
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const gate = await gateAdminOp({
    adminUserId: session.userId,
    totpCode: parsed.data.totpCode,
    reason: parsed.data.reason,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (id === session.userId) {
    return NextResponse.json({ error: 'Admins reset their own MFA via /admin/security.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, firstName: true, lastName: true, displayName: true,
    },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Find the customer's active TOTP secret(s). If there are none, return
  // 409 — there's nothing to reset, and silently writing an audit row
  // would mislead a future reviewer.
  const activeCount = await prisma.mfaSecret.count({
    where: { userId: id, type: 'totp', isActive: true },
  });
  if (activeCount === 0) {
    return NextResponse.json(
      { error: 'This customer has no active authenticator to reset.' },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.$transaction(async (tx: any) => {
    await tx.mfaSecret.updateMany({
      where: { userId: id, type: { in: ['totp', 'backup_codes'] }, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    await tx.user.update({
      where: { id },
      data: { mfaRequired: false },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_CUSTOMER_MFA_RESET',
        resourceType: 'User',
        resourceId: id,
        targetUserId: id,
        metadata: {
          targetEmail: target.email,
          reason: parsed.data.reason,
          documentsReviewed: parsed.data.documentsReviewed,
        },
      },
    });
  });

  const displayName =
    target.displayName ?? `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() ?? target.email;
  void sendCustomerMfaResetEmail(target.email, displayName).catch((err) =>
    logger.warn(
      { userId: id, err: err instanceof Error ? err.message : err },
      'customer MFA reset email failed',
    ),
  );

  logger.warn(
    { adminId: session.userId, targetUserId: id, documentsReviewed: parsed.data.documentsReviewed },
    'admin reset customer TOTP',
  );

  return NextResponse.json({ ok: true });
}
