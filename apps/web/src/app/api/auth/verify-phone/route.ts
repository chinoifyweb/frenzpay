/**
 * POST /api/auth/verify-phone  —  DEPRECATED 2026-04-18
 *
 * SMS verification was removed at signup to reduce friction (phone number is
 * captured for KYC but not gated by OTP). This route is kept as a compat stub
 * that returns 410 Gone so any stale client still calling it gets a clear
 * signal instead of a silent 404.
 *
 * Phone verification now happens at KYC T1 (BVN / NIN cross-reference via
 * Dojah) where the phone on the ID is matched against User.phone. See
 * apps/web/src/app/api/kyc/t1/route.ts.
 */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Phone verification is no longer required at signup.',
      deprecated: true,
      since: '2026-04-18',
      nextStep: 'dashboard',
    },
    { status: 410 },
  );
}
