/**
 * POST /api/auth/reset-password
 *
 * Resets a user's password using a token from forgot-password.
 * Token is single-use and expires after 15 minutes.
 *
 * Body: { token, newPassword }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { hashPassword, hashToken } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { deleteAllUserSessions } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  token: z.string().min(64).max(64),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .refine((v) => /[A-Z]/.test(v), 'Must contain an uppercase letter')
    .refine((v) => /[a-z]/.test(v), 'Must contain a lowercase letter')
    .refine((v) => /[0-9]/.test(v), 'Must contain a number')
    .refine((v) => /[^A-Za-z0-9]/.test(v), 'Must contain a special character'),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'password_reset' });
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
    return NextResponse.json(
      { error: 'Valid token and new password required', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, status: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link. Please request a new one.' },
      { status: 400 },
    );
  }

  if (record.user.status === 'DELETED') {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash: newHash },
    });
  });

  // Revoke all existing sessions (security best practice after password reset)
  await deleteAllUserSessions(record.user.id);

  logger.info({ userId: record.user.id }, 'password reset successful — all sessions revoked');

  return NextResponse.json({
    success: true,
    message: 'Password reset successfully. Please log in with your new password.',
  });
}
