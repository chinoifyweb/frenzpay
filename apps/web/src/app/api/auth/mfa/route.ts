/**
 * GET /api/auth/mfa
 *
 * Returns the current customer's MFA enrolment state. Used by the
 * /dashboard/security/2fa page to render either the "Set up Google
 * Authenticator" entry or the "Already enrolled" panel.
 *
 * Response:
 *   { enrolled: boolean, email: string, fullName: string }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET() {
  const { session } = await requireSession();

  const [user, totpCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, firstName: true, lastName: true, displayName: true },
    }),
    prisma.mfaSecret.count({
      where: { userId: session.userId, type: 'totp', isActive: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const fullName =
    user.displayName ?? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ?? user.email;

  return NextResponse.json({
    enrolled: totpCount > 0,
    email: user.email,
    fullName,
  });
}
