/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Full Redis session validation — not just cookie check.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const result = await getSession();

  if (!result) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: result.session.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      kycTier: true,
      kycStatus: true,
      emailVerified: true,
      phoneVerified: true,
      mfaRequired: true,
      status: true,
      createdAt: true,
      frenzTag: { select: { tag: true, isVerified: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user });
}
