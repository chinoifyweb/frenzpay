// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/mfa/verify
 *
 * Body: { code: string (6 digits) }
 *
 * Pulls the pending secret from Redis, verifies the admin's TOTP code
 * matches, then encrypts the secret and writes it to admin_users.mfa_secret.
 * Clears the Redis stash on success.
 *
 * Writes an admin_audit_logs entry on success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { redis } from '@/lib/redis';
import { encryptField } from '@frenzpay/crypto';
import { verifyTotp } from '@frenzpay/auth/totp';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

function pendingKey(adminId: string) {
  return `admin-mfa-pending:${adminId}`;
}

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
    select: { mfaSecret: true, email: true },
  });
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  if (admin.mfaSecret) {
    return NextResponse.json(
      { error: 'TOTP is already enrolled.' },
      { status: 409 },
    );
  }

  const pending = await redis.get(pendingKey(session.userId));
  if (!pending) {
    return NextResponse.json(
      {
        error:
          'Enrolment window expired. Start over from /admin/security.',
      },
      { status: 410 },
    );
  }

  if (!verifyTotp(pending, parsed.data.code)) {
    return NextResponse.json({ error: 'Code did not match.' }, { status: 403 });
  }

  // Encrypt the secret and commit
  const cipher = encryptField(pending, `admin:${session.userId}:totp`);
  const serialised = JSON.stringify(cipher);

  await prisma.$transaction(async (tx: any) => {
    await tx.adminUser.update({
      where: { id: session.userId },
      data: { mfaSecret: serialised },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: session.userId,
        action: 'ADMIN_MFA_ENROLLED',
        resourceType: 'AdminUser',
        resourceId: session.userId,
        metadata: { method: 'totp' },
      },
    });
  });

  // Clean up the Redis stash
  try { await redis.del(pendingKey(session.userId)); } catch { /* non-fatal */ }

  logger.info({ adminId: session.userId, email: admin.email }, 'Admin TOTP enrolled');

  return NextResponse.json({ ok: true, enrolled: true });
}
