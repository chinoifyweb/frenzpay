/**
 * POST /api/auth/login/verify-otp
 *
 * Second factor on every customer sign-in. The first factor (email +
 * password) lives in /api/auth/login and never mints a session by
 * itself; on success it issues a `challengeToken` and emails a 6-digit
 * code. This route is where the user redeems both.
 *
 * Body: { challengeToken: hex64, code: digits6 }
 *
 * Flow:
 *   1. Rate-limit (per IP, then per user once we know who it is)
 *   2. Look up the challenge in Redis (`login_otp:{challengeToken}`)
 *   3. Increment the attempt counter; reject after 5 wrong tries (single
 *      challenge can't be brute-forced)
 *   4. Hash the supplied code, compare against stored hash (timing-safe)
 *   5. Delete the Redis key (single-use)
 *   6. Mint a real session cookie + persist a Session row for audit
 *
 * On success we mark the new session `mfaVerified: true` so anything that
 * later asks "is this session second-factored?" gets a yes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  challengeToken: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid challenge token'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

interface ChallengePayload {
  userId: string;
  otpHash: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  attempts: number;
}

const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  // 1. IP rate-limit
  const rl = await checkAuthRateLimit(redis, { ip, action: 'otp_verify' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait before trying again.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we emailed you.' }, { status: 422 });
  }

  // 2. Look up challenge
  const key = `login_otp:${parsed.data.challengeToken}`;
  const raw = await redis.get(key);
  if (!raw) {
    return NextResponse.json(
      { error: 'This sign-in attempt expired. Start over from the login screen.' },
      { status: 410 },
    );
  }

  let payload: ChallengePayload;
  try { payload = JSON.parse(raw) as ChallengePayload; }
  catch {
    await redis.del(key).catch(() => {});
    return NextResponse.json({ error: 'Sign-in token corrupted — please start over.' }, { status: 400 });
  }

  // 3. Per-user rate-limit (now that we know the userId)
  const userRl = await checkAuthRateLimit(redis, { ip, userId: payload.userId, action: 'otp_verify' });
  if (!userRl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts on this account. Please wait.' },
      { status: 429, headers: rateLimitHeaders(userRl) },
    );
  }

  // 4. Brute-force guard on this challenge
  if (payload.attempts >= MAX_ATTEMPTS) {
    await redis.del(key).catch(() => {});
    return NextResponse.json(
      { error: 'Too many wrong codes — sign in again to get a fresh code.' },
      { status: 429 },
    );
  }

  // 5. Compare hash with timing-safe equality
  const givenHash = createHash('sha256').update(parsed.data.code).digest();
  const storedHash = Buffer.from(payload.otpHash, 'hex');
  const codeOk =
    givenHash.length === storedHash.length &&
    timingSafeEqual(givenHash, storedHash);

  if (!codeOk) {
    // Bump the attempt counter, keep the Redis TTL on the existing entry.
    const newAttempts = payload.attempts + 1;
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.set(
        key,
        JSON.stringify({ ...payload, attempts: newAttempts }),
        'EX',
        ttl,
      );
    }
    return NextResponse.json(
      {
        error: 'Wrong code. Try again.',
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - newAttempts),
      },
      { status: 401 },
    );
  }

  // 6. Code valid — single-use, so wipe immediately
  await redis.del(key).catch(() => {});

  // Load up the user fresh — status / kycTier may have changed in the
  // 0..10 minutes since the password was verified.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true, email: true, status: true, kycTier: true,
      firstName: true, lastName: true, displayName: true,
      emailVerified: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }
  if (user.status === 'FROZEN' || user.status === 'SUSPENDED' || user.status === 'DELETED') {
    return NextResponse.json({ error: 'Your account is not allowed to sign in.' }, { status: 403 });
  }

  // 7. Mint session + cookie
  const cookieValue = await createSession({
    userId: user.id,
    email: user.email,
    role: 'user',
    kycTier: tierToNumber(user.kycTier),
    deviceId: payload.deviceId,
    ipAddress: payload.ip,
    userAgent: payload.userAgent,
    mfaVerified: true,                 // email-OTP cleared
  });

  await prisma.session.create({
    data: {
      userId: user.id,
      token: createHash('sha256').update(cookieValue).digest('hex'),
      deviceId: payload.deviceId,
      ipAddress: payload.ip,
      userAgent: payload.userAgent,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
    },
  }).catch(() => null); // non-fatal; Redis is the source of truth

  logger.info({ userId: user.id }, 'login: OTP verified, session minted');

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
      kycTier: user.kycTier,
      emailVerified: user.emailVerified,
    },
  });
  response.cookies.set(sessionCookieOptions(cookieValue, 12 * 3600));
  return response;
}

function tierToNumber(tier: string): number {
  const map: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
  return map[tier] ?? 0;
}
