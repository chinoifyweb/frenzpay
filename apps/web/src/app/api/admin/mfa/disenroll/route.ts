// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/mfa/disenroll
 *
 * Body: { code: string (current TOTP) }
 *
 * Requires the admin to supply a fresh TOTP code from the currently-enrolled
 * device before removing it. After disenrolment, all break-glass admin ops
 * (freeze/unfreeze user, etc.) will fail until a new TOTP is enrolled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { decryptField } from '@frenzpay/crypto';
import { verifyTotp } from '@frenzpay/auth/totp';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export async function POST(req: NextRequest) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 422 },
    );
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { mfaSecret: true },
  });
  if (!admin || !admin.mfaSecret) {
    return NextResponse.json({ error: 'TOTP is not enrolled.' }, { status: 409 });
  }

  let base32Secret: string;
  try {
    const cipher = JSON.parse(admin.mfaSecret);
    base32Secret = decryptField(cipher);
  } catch {
    return NextResponse.json({ error: 'Failed to load the existing secret.' }, { status: 500 });
  }

  if (!verifyTotp(base32Secret, parsed.data.code)) {
    return NextResponse.json({ error: 'Code did not match.' }, { status: 403 });
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.adminUser.update({
      where: { id: session.userId },
      data: { mfaSecret: null },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_MFA_DISENROLLED',
        resourceType: 'AdminUser',
        resourceId: session.userId,
      },
    });
  });

  logger.info({ adminId: session.userId }, 'Admin TOTP disenrolled');

  return NextResponse.json({ ok: true, enrolled: false });
}
