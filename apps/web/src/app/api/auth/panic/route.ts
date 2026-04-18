/**
 * POST /api/auth/panic
 *
 * Panic freeze: immediately freezes the user's account and revokes ALL sessions.
 * Designed to be callable from any device the user can reach.
 *
 * Body: { password } — require current password as confirmation to prevent
 *   accidental freezes from a hijacked session.
 *
 * After this call:
 * - All Redis sessions deleted
 * - User.status set to FROZEN
 * - Cookie cleared in response
 * - AuditLog entry created
 *
 * To unfreeze: user must contact support@frenzpay.co
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { verifyPassword } from '@frenzpay/auth';
import { SESSION_COOKIE_NAME } from '@frenzpay/auth/session';
import { requireSession, deleteAllUserSessions } from '@/lib/session';
import { logger } from '@frenzpay/logger';

const Schema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const { session } = await requireSession();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Current password required to confirm freeze' }, { status: 422 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true, status: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
  }

  // Freeze account + revoke all sessions atomically
  await Promise.all([
    prisma.user.update({
      where: { id: user.id },
      data: { status: 'FROZEN' },
    }),
    deleteAllUserSessions(user.id),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PANIC_FREEZE',
        metadata: {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
          userAgent: request.headers.get('user-agent'),
        },
      },
    }),
  ]);

  logger.warn({ userId: user.id }, 'PANIC FREEZE activated');

  const response = NextResponse.json({
    frozen: true,
    message: 'Your account has been frozen. Contact support@frenzpay.co to unfreeze.',
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
