/**
 * POST /api/auth/mfa/totp-verify
 *
 * Two modes:
 *
 * MODE 1 — Setup confirmation (body: { token, mode: 'setup' })
 *   Verifies the TOTP token against the pending secret stored in Redis.
 *   On success: persists MfaSecret to DB, generates backup codes, enables MFA.
 *   Returns { backupCodes: string[] } — shown ONCE.
 *
 * MODE 2 — Login challenge (body: { token, challengeToken, mode: 'challenge' })
 *   Verifies TOTP against the user's active MfaSecret.
 *   challengeToken must match a Redis key `mfa_challenge:{challengeToken}`.
 *   On success: creates a full session and sets cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { verifyTotp, generateBackupCodes } from '@frenzpay/auth/totp';
import { encryptField, decryptField } from '@frenzpay/crypto';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { getSession, createSession, sessionCookieOptions } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import type { CipherPayload } from '@frenzpay/crypto';

const SetupSchema = z.object({
  token: z.string().regex(/^\d{6}$/),
  mode: z.literal('setup'),
});

const ChallengeSchema = z.object({
  token: z.string().regex(/^\d{6}$/),
  challengeToken: z.string().min(64).max(64),
  mode: z.literal('challenge'),
});

const Schema = z.union([SetupSchema, ChallengeSchema]);

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'mfa_verify' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many MFA attempts. Please wait.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  }

  // ── Mode 1: Setup confirmation ────────────────────────────────────────────

  if (parsed.data.mode === 'setup') {
    const { session } = await getSession() ?? {};
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.userId;
    const pending = await redis.get(`totp_pending:${userId}`);
    if (!pending) {
      return NextResponse.json(
        { error: 'TOTP setup session expired. Please start setup again.' },
        { status: 400 },
      );
    }

    const { secret } = JSON.parse(pending) as { encrypted: CipherPayload; secret: string };

    if (!verifyTotp(secret, parsed.data.token)) {
      return NextResponse.json(
        { error: 'Invalid code. Please check your authenticator app.' },
        { status: 400 },
      );
    }

    // Generate backup codes
    const { codes, hashes } = generateBackupCodes();

    // Store encrypted TOTP secret + hashed backup codes in DB
    const encryptedSecret = encryptField(secret, `totp:${userId}`);

    await prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {
      // Deactivate any existing TOTP secrets
      await tx.mfaSecret.updateMany({
        where: { userId, type: 'totp', isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      });

      await tx.mfaSecret.create({
        data: {
          userId,
          type: 'totp',
          secret: JSON.stringify(encryptedSecret),
          isActive: true,
        },
      });

      // Store backup codes (hashed)
      await tx.mfaSecret.create({
        data: {
          userId,
          type: 'backup_codes',
          secret: JSON.stringify(hashes),
          isActive: true,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { mfaRequired: true },
      });
    });

    // Clean up pending setup
    await redis.del(`totp_pending:${userId}`);

    logger.info({ userId }, 'TOTP MFA enabled');

    return NextResponse.json({
      success: true,
      backupCodes: codes, // shown once
    });
  }

  // ── Mode 2: Login challenge ───────────────────────────────────────────────

  const { challengeToken, token } = parsed.data;
  const challengeKey = `mfa_challenge:${challengeToken}`;
  const challengeRaw = await redis.get(challengeKey);

  if (!challengeRaw) {
    return NextResponse.json(
      { error: 'MFA challenge expired. Please log in again.' },
      { status: 400 },
    );
  }

  const challenge = JSON.parse(challengeRaw) as {
    userId: string;
    deviceId: string;
    ip: string;
    userAgent: string;
  };

  // Get user's TOTP secret
  const mfaSecret = await prisma.mfaSecret.findFirst({
    where: { userId: challenge.userId, type: 'totp', isActive: true },
  });

  if (!mfaSecret) {
    return NextResponse.json({ error: 'MFA not configured' }, { status: 400 });
  }

  let plainSecret: string;
  try {
    const payload = JSON.parse(mfaSecret.secret) as CipherPayload;
    plainSecret = decryptField(payload, `totp:${challenge.userId}`);
  } catch {
    logger.error({ userId: challenge.userId }, 'TOTP secret decryption failed');
    return NextResponse.json({ error: 'MFA configuration error' }, { status: 500 });
  }

  if (!verifyTotp(plainSecret, token)) {
    return NextResponse.json(
      { error: 'Invalid code. Please try again.' },
      { status: 400 },
    );
  }

  // Delete challenge (single-use)
  await redis.del(challengeKey);

  // Create full session
  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, email: true, kycTier: true, displayName: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tierMap: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const cookieValue = await createSession({
    userId: user.id,
    email: user.email,
    role: 'user',
    kycTier: tierMap[user.kycTier] ?? 0,
    deviceId: challenge.deviceId,
    ipAddress: challenge.ip,
    userAgent: challenge.userAgent,
    mfaVerified: true,
  });

  logger.info({ userId: user.id }, 'MFA login successful');

  const response = NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });

  response.cookies.set(sessionCookieOptions(cookieValue, 12 * 3600));
  return response;
}
