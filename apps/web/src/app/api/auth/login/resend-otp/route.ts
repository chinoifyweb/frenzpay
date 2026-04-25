/**
 * POST /api/auth/login/resend-otp
 *
 * Issue a fresh 6-digit code against an existing login challenge. Used
 * when the customer didn't get the first email (spam folder, slow SMTP)
 * or accidentally let it expire while typing.
 *
 * Body: { challengeToken }
 *
 * Rate-limited per-IP and per-challenge (max 3 resends inside one
 * challenge window) so a leaked token can't be turned into an email
 * spamming machine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomInt } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import { sendLoginOtpEmail } from '@/lib/email';

const Schema = z.object({
  challengeToken: z.string().regex(/^[a-f0-9]{64}$/),
});

interface ChallengePayload {
  userId: string;
  otpHash: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  attempts: number;
  resends?: number;
}

const MAX_RESENDS_PER_CHALLENGE = 3;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'otp_resend' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many resend attempts. Please wait.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid challenge token' }, { status: 422 });
  }

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

  const resends = payload.resends ?? 0;
  if (resends >= MAX_RESENDS_PER_CHALLENGE) {
    return NextResponse.json(
      { error: 'You\u2019ve resent the code the maximum number of times. Sign in again for a fresh attempt.' },
      { status: 429 },
    );
  }

  // Fresh code, replace stored hash, reset attempt counter (a new code
  // means past wrong tries don't count any more).
  const newOtp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const newOtpHash = createHash('sha256').update(newOtp).digest('hex');
  const ttl = await redis.ttl(key);
  await redis.set(
    key,
    JSON.stringify({
      ...payload,
      otpHash: newOtpHash,
      attempts: 0,
      resends: resends + 1,
    }),
    'EX',
    ttl > 0 ? ttl : 600,
  );

  // Look up the user for the email body — we don't have their email
  // address in the challenge payload, just userId.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, firstName: true },
  });
  if (!user) {
    // Shouldn't happen, but fail gracefully.
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  void sendLoginOtpEmail(user.email, user.firstName ?? user.email, newOtp, {
    ip: payload.ip,
    userAgent: payload.userAgent,
  }).catch((err) =>
    logger.warn(
      { userId: payload.userId, err: err instanceof Error ? err.message : err },
      'login OTP resend email failed',
    ),
  );

  logger.info({ userId: payload.userId, resends: resends + 1 }, 'login: OTP resent');

  return NextResponse.json({ ok: true, resendsRemaining: MAX_RESENDS_PER_CHALLENGE - (resends + 1) });
}
