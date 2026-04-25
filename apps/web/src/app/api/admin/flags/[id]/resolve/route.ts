/**
 * POST /api/admin/flags/[id]/resolve
 *
 * Mark a fraud-engine flag as resolved. The original flag row in audit_logs
 * stays untouched (audit logs are immutable) — we append a corresponding
 * admin_audit_logs row with action=FRAUD_RESOLVED and resourceId=<flag id>
 * which the /api/admin/flags GET endpoint joins against to decorate each
 * flag with resolution status.
 *
 * Body: { totpCode: string (6 digits), note: string (min 10 chars) }
 *   - totpCode: admin's own TOTP, gated through gateAdminOp() to make
 *     sure a hijacked admin session can't quietly clear flags.
 *   - note: required (min 10 chars) so there's always a paper-trail
 *     reason. Was previously optional, but flag resolution is a
 *     compliance-sensitive action.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { gateAdminOp } from '@/lib/admin-mfa';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  totpCode: z.string().regex(/^\d{6}$/),
  note: z.string().min(10, 'Note must be at least 10 characters').max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireRole('admin');

  const { id } = await params;

  // audit_logs.id is bigint — the UI passes it as a string, parse safely
  let flagBigInt: bigint;
  try {
    flagBigInt = BigInt(id);
  } catch {
    return NextResponse.json({ error: 'Invalid flag id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // TOTP gate — flag resolution is compliance-sensitive, gateAdminOp()
  // verifies the admin's own TOTP and emits an admin_op_totp_used audit
  // row. Without this a hijacked session could quietly clear flags.
  const gate = await gateAdminOp({
    adminUserId: session.userId,
    totpCode: parsed.data.totpCode,
    reason: parsed.data.note,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const flag = await prisma.auditLog.findUnique({
    where: { id: flagBigInt },
    select: { id: true, action: true, userId: true },
  });
  if (!flag) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  }
  if (!flag.action.startsWith('FRAUD_')) {
    return NextResponse.json(
      { error: 'Target is not a fraud flag.' },
      { status: 400 },
    );
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: session.userId,
      action: 'FRAUD_RESOLVED',
      resourceType: 'FraudFlag',
      resourceId: id, // keep as string — that's what we match on
      targetUserId: flag.userId ?? null,
      metadata: {
        originalAction: flag.action,
        note: parsed.data.note,
      },
    },
  });

  logger.info(
    { adminId: session.userId, flagId: id, originalAction: flag.action },
    'fraud flag resolved',
  );

  return NextResponse.json({ ok: true, flagId: id });
}
