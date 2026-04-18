/**
 * POST /api/auth/verify-email
 *
 * Verifies a 6-digit email OTP sent at signup.
 * After success: marks user.emailVerified = true.
 * If phone also verified → creates session (user is fully authenticated for T0).
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
    return NextResponse.json({ error: 'userId and 6-digit otp required' }, { status: 422 });
  }

  const { userId, otp } = parsed.data;
  const tokenHash = hashToken(otp);
  const now = new Date();

  const token = await prisma.emailVerificationToken.findFirst({
    where: {
      userId,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (!token) {
    return NextResponse.json(
      { error: 'Invalid or expired OTP. Please request a new one.' },
      { status: 400 },
    );
  }

  // Mark token used + set emailVerified in transaction
  const user = await prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {
    await tx.emailVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: now },
    });

    return tx.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      select: {
        id: true, email: true, phoneVerified: true, kycTier: true,
        displayName: true, firstName: true, lastName: true,
      },
    });
  });

  logger.info({ userId }, 'email verified');

  // If phone is also verified, auto-create session so user lands on dashboard
  if (user.phoneVerified) {
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

  return NextResponse.json({
    verified: true,
    nextStep: 'verify_phone',
  });
}
