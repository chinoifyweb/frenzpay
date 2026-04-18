/**
 * POST /api/auth/resend-otp
 *
 * Resends a verification OTP.
 * Body: { userId, type: 'email' | 'phone' }
 *
 * Rate limited: 3/10min per user.
 * Invalidates any existing unused OTP for the same userId+type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { generateOtp, hashToken } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import { sendEmailVerificationOtp } from '@/lib/email';

const Schema = z.object({
  userId: z.string().uuid(),
  // SMS resend was removed 2026-04-18. Schema still accepts "phone" so old
  // clients don't crash; the handler short-circuits with a 410 below.
  type: z.enum(['email', 'phone']),
});

const OTP_TTL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'otp_send' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many resend requests. Please wait a few minutes.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'userId and type (email|phone) required' }, { status: 422 });
  }

  const { userId, type } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, phone: true, emailVerified: true, phoneVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Don't resend if already verified
  if (type === 'email' && user.emailVerified) {
    return NextResponse.json({ error: 'Email already verified' }, { status: 400 });
  }
  if (type === 'phone' && user.phoneVerified) {
    return NextResponse.json({ error: 'Phone already verified' }, { status: 400 });
  }

  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  if (type === 'email') {
    // Expire previous tokens
    await prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { expiresAt: new Date(0) },
    });

    await prisma.emailVerificationToken.create({
      data: { userId, tokenHash: otpHash, expiresAt },
    });

    // Send via Resend. Fire-and-forget; if this fails the user can retry.
    try {
      await sendEmailVerificationOtp(user.email, user.firstName ?? '', otp);
      logger.info({ userId }, 'resend: email OTP sent');
    } catch (err) {
      logger.error(
        { userId, err: err instanceof Error ? err.message : err },
        'resend: email OTP failed to send',
      );
    }
  } else {
    // SMS verification removed 2026-04-18. Short-circuit so stale clients
    // get a deterministic 410 instead of a silent no-op.
    logger.info({ userId }, 'resend: phone OTP requested but SMS layer is disabled');
    return NextResponse.json(
      {
        error: 'Phone verification is no longer required at signup.',
        deprecated: true,
        since: '2026-04-18',
      },
      { status: 410 },
    );
  }

  const response: Record<string, unknown> = {
    sent: true,
    message: `A new verification code has been sent to your ${type}.`,
  };

  if (process.env.NODE_ENV !== 'production') {
    response['_devOtp'] = otp;
  }

  return NextResponse.json(response);
}
