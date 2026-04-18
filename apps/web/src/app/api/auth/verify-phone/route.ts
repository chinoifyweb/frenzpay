/**
 * POST /api/auth/verify-phone
 *
 * Verifies a 6-digit phone OTP.
 * After success: marks user.phoneVerified = true.
 * If email also verified → creates session.
 *
 * Body: { userId, otp }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { hashToken } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  userId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'otp_verify' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'userId and 6-digit otp required' }, { status: 422 });
  }

  const { userId, otp } = parsed.data;
  const otpHash = hashToken(otp);
  const now = new Date();

  const record = await prisma.phoneOtp.findFirst({
    where: {
      userId,
      otpHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (!record) {
    // Increment attempts for the latest unexpired OTP (for audit)
    await prisma.phoneOtp.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 } },
    });

    return NextResponse.json(
      { error: 'Invalid or expired OTP. Please request a new one.' },
      { status: 400 },
    );
  }

  const user = await prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {
    await tx.phoneOtp.update({
      where: { id: record.id },
      data: { usedAt: now },
    });

    return tx.user.update({
      where: { id: userId },
      data: { phoneVerified: true },
      select: {
        id: true, email: true, emailVerified: true, kycTier: true,
        displayName: true, firstName: true, lastName: true,
      },
    });
  });

  logger.info({ userId }, 'phone verified');

  if (user.emailVerified) {
    const cookieValue = await createSession({
      userId: user.id,
      email: user.email,
      role: 'user',
      kycTier: 0,
      mfaVerified: false,
    });

    const response = NextResponse.json({
      verified: true,
      nextStep: 'dashboard',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
      },
    });

    response.cookies.set(sessionCookieOptions(cookieValue, 12 * 3600));
    return response;
  }

  return NextResponse.json({ verified: true, nextStep: 'verify_email' });
}
