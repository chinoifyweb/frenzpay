/**
 * POST /api/auth/logout
 *
 * Deletes the Redis session and clears the cookie.
 * Silently succeeds if no session found (idempotent).
 */

import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@frenzpay/auth/session';
import { getSession, deleteSession } from '@/lib/session';

export async function POST() {
  try {
    const result = await getSession();
    if (result) {
      await deleteSession(result.sid, result.session.userId);
    }
  } catch {
    // Silently ignore — we always clear the cookie
  }

  const response = NextResponse.json({ success: true });
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
