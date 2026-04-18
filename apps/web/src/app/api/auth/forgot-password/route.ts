/**
 * POST /api/auth/forgot-password
 *
 * Issues a password reset token.
 * Always returns 200 with a generic message regardless of whether the email
 * exists — to prevent user enumeration.
 *
 * Body: { email }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { generateSecureToken, hashToken } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
});

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'password_reset' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 422 });
  }

  const { email } = parsed.data;

  // Add artificial delay to prevent timing-based enumeration
  const delayMs = 200 + Math.random() * 200;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  if (user && user.status !== 'DELETED') {
    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Expire all previous reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(0) },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    // TODO(phase-7): send reset email with link /reset-password?token={token}
    logger.info({ userId: user.id }, 'password reset token issued');

    if (process.env.NODE_ENV !== 'production') {
      // In dev, return the raw token so we can test without email
      await new Promise((r) => setTimeout(r, delayMs));
      return NextResponse.json({
        sent: true,
        message: 'If an account exists, a reset link has been sent.',
        _devToken: token,
      });
    }
  }

  await new Promise((r) => setTimeout(r, delayMs));

  return NextResponse.json({
    sent: true,
    message: 'If an account exists with that email, a reset link has been sent.',
  });
}
