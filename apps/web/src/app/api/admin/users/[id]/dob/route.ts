/**
 * PATCH /api/admin/users/[id]/dob
 *
 * Admin-only endpoint to set/update a user's date of birth. Used to
 * backfill DOB on customers who completed KYC before DOB collection
 * was added to the form (their User.dob is null and Graph
 * provisioning fails with "Missing fields required by Graph: dob").
 *
 * Body:  { dob: 'YYYY-MM-DD' }
 * Stores: encrypted on User.dob (JSONB CipherPayload), AAD = userId.
 * Audit: writes ADMIN_USER_DOB_SET to admin_audit_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { encryptField } from '@frenzpay/crypto';
import { requireSession } from '@/lib/session';
import { logger } from '@frenzpay/logger';

const Body = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const dobStr = parsed.data.dob;
  const dobDate = new Date(dobStr + 'T00:00:00Z');
  if (Number.isNaN(dobDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 422 });
  }
  // 18+ — Graph rejects under-18s anyway and downstream compliance
  // requires it.
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
  if (dobDate > eighteenYearsAgo) {
    return NextResponse.json(
      { error: 'Customer would be under 18 with this date of birth.' },
      { status: 422 },
    );
  }
  if (dobDate < new Date('1900-01-01T00:00:00Z')) {
    return NextResponse.json({ error: 'Date of birth is too far in the past.' }, { status: 422 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, dob: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const encryptedDob = encryptField(dobStr, target.id);

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id: target.id },
      data: { dob: encryptedDob as any },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_USER_DOB_SET',
        resourceType: 'User',
        resourceId: target.id,
        targetUserId: target.id,
        // Don't log the DOB itself — it's PII and we already encrypted
        // it. Just record that it was set vs updated.
        metadata: { previouslySet: target.dob !== null },
      },
    });
  });

  logger.info(
    { adminId: session.userId, userId: target.id, previouslySet: target.dob !== null },
    'admin set user DOB',
  );

  return NextResponse.json({ ok: true });
}
