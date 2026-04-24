// Force dynamic — reads session cookie.
export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/mfa — return current TOTP enrolment state for the admin
 * POST /api/admin/mfa/enroll — generate a candidate TOTP secret (one-time; returns otpauth URL + provisioning payload)
 * POST /api/admin/mfa/verify — confirm the candidate with a 6-digit code and persist it
 * DELETE /api/admin/mfa — disenrol (requires current TOTP; irreversible; blocks high-privilege ops after)
 *
 * All routes require an admin session. Secrets are encrypted with the platform
 * envelope key (CRYPTO_MASTER_KEY) before being written.
 *
 * State machine:
 *   enrolled=false + no candidate → user hits /enroll, gets a fresh secret + otpauth URL,
 *     candidate is stashed in a short-TTL Redis key. Must verify within 10 min.
 *   enrolled=false + candidate pending → user hits /verify with a code; if matches,
 *     candidate moves from Redis to admin_users.mfa_secret and enrolment flag flips.
 *   enrolled=true → /enroll reverts to the "already enrolled" response; the admin
 *     must /delete first to re-enrol.
 */

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';

export async function GET() {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { mfaSecret: true, email: true, fullName: true },
  });
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

  return NextResponse.json({
    enrolled: !!admin.mfaSecret,
    email: admin.email,
    fullName: admin.fullName,
  });
}
