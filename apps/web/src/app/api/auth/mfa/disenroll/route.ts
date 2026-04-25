/**
 * POST /api/auth/mfa/disenroll
 *
 * Customer disables Google Authenticator on their account. Requires a
 * fresh 6-digit TOTP code so a hijacked session can't strip 2FA off.
 *
 * Body: { token: string (6 digits) }
 *
 * Side effects:
 *   - Marks the active TOTP MfaSecret + backup_codes rows isActive=false
 *   - Sets user.mfaRequired=false (login flow falls back to email OTP)
 *   - Audit log row in audit_logs (customer-side)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { verifyTotp } from '@frenzpay/auth/totp';
import { decryptField, type CipherPayload } from '@frenzpay/crypto';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  token: z.string().regex(/^\d{6}$/, 'Token must be 6 digits'),
});

export async function POST(request: NextRequest) {
  const { session } = await requireSession();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  // Same family as totp-verify — 5 wrong tries / 10 min per user, then back off.
  const rl = await checkAuthRateLimit(redis, {
    ip, userId: session.userId, action: 'mfa_verify',
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a bit before trying again.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your authenticator.' }, { status: 422 });
  }

  // Pull the active TOTP secret to verify the supplied code against.
  const active = await prisma.mfaSecret.findFirst({
    where: { userId: session.userId, type: 'totp', isActive: true },
    select: { id: true, secret: true },
  });
  if (!active) {
    return NextResponse.json({ error: 'No active authenticator on this account.' }, { status: 409 });
  }

  let plaintextSecret: string;
  try {
    const payload = JSON.parse(active.secret) as CipherPayload;
    plaintextSecret = decryptField(payload, `totp:${session.userId}`);
  } catch (err) {
    logger.error(
      { userId: session.userId, err: err instanceof Error ? err.message : err },
      'TOTP secret decrypt failed during disenroll',
    );
    return NextResponse.json({ error: 'Could not verify code. Contact support.' }, { status: 500 });
  }

  if (!verifyTotp(plaintextSecret, parsed.data.token)) {
    return NextResponse.json({ error: 'Wrong code. Try again.' }, { status: 400 });
  }

  // Code valid — deactivate TOTP + backup codes, drop the mfaRequired flag.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.$transaction(async (tx: any) => {
    await tx.mfaSecret.updateMany({
      where: { userId: session.userId, type: { in: ['totp', 'backup_codes'] }, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    await tx.user.update({
      where: { id: session.userId },
      data: { mfaRequired: false },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'MFA_DISENROLLED',
        resourceType: 'User',
        resourceId: session.userId,
        metadata: { method: 'totp' },
      },
    });
  });

  logger.info({ userId: session.userId }, 'customer disenrolled TOTP');

  return NextResponse.json({ ok: true });
}
