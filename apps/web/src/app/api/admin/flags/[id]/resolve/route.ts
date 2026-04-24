/**
 * POST /api/admin/flags/[id]/resolve
 *
 * Mark a fraud-engine flag as resolved. The original flag row in audit_logs
 * stays untouched (audit logs are immutable) — we append a corresponding
 * admin_audit_logs row with action=FRAUD_RESOLVED and resourceId=<flag id>
 * which the /api/admin/flags GET endpoint joins against to decorate each
 * flag with resolution status.
 *
 * Body: { note?: string }  // optional free-text resolution note (max 1000)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  note: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
        note: parsed.data.note ?? null,
      },
    },
  });

  logger.info(
    { adminId: session.userId, flagId: id, originalAction: flag.action },
    'fraud flag resolved',
  );

  return NextResponse.json({ ok: true, flagId: id });
}
