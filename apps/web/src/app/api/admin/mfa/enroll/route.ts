// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/mfa/enroll
 *
 * Generate a fresh TOTP secret for the admin and return:
 *   - otpauth URL (scannable as QR code in any authenticator app)
 *   - the raw base32 secret (for manual entry as a fallback)
 *
 * The secret is stashed in Redis under a short-lived key (10 minutes) so the
 * admin has time to scan + verify before it expires. Only after /verify
 * confirms a working code does the secret graduate to admin_users.mfa_secret.
 *
 * If the admin already has a secret on file, re-enrolment is blocked —
 * they must DELETE first. This prevents an attacker who takes over a
 * session from silently rotating the MFA to a device they control.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { redis } from '@/lib/redis';
import { generateTotpSecret } from '@frenzpay/auth/totp';
import { logger } from '@frenzpay/logger';

const PENDING_TTL_SECONDS = 10 * 60;

function pendingKey(adminId: string) {
  return `admin-mfa-pending:${adminId}`;
}

export async function POST() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { mfaSecret: true, email: true, isActive: true },
  });
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  if (!admin.isActive) return NextResponse.json({ error: 'Account disabled' }, { status: 403 });

  if (admin.mfaSecret) {
    return NextResponse.json(
      {
        error:
          'TOTP is already enrolled. Remove the existing enrolment before adding a new device.',
      },
      { status: 409 },
    );
  }

  const { secret, uri } = generateTotpSecret({
    issuer: 'FrenzPay Admin',
    accountName: admin.email,
  });

  try {
    await redis.set(pendingKey(session.userId), secret, 'EX', PENDING_TTL_SECONDS);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, adminId: session.userId },
      '[admin-mfa/enroll] Redis stash failed',
    );
    return NextResponse.json({ error: 'Could not start enrolment. Try again.' }, { status: 500 });
  }

  logger.info({ adminId: session.userId, email: admin.email }, 'Admin TOTP enrolment started');

  return NextResponse.json({
    secret,
    uri,
    expiresInSeconds: PENDING_TTL_SECONDS,
    hint: 'Scan the QR code in your authenticator app, then submit the first 6-digit code via /api/admin/mfa/verify within 10 minutes.',
  });
}
