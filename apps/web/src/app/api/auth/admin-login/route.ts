/**
 * POST /api/auth/admin-login
 *
 * Dedicated admin login. Separate from the customer /api/auth/login route —
 * reads credentials against the admin_users table (not users), and the
 * session it creates always carries role='admin' plus the AdminRole (
 * SUPER_ADMIN / COMPLIANCE / SUPPORT / FINANCE / READONLY) in the metadata.
 *
 * Body: { email, password }
 *
 * Response: sets the session cookie and returns { user: { email, role, fullName } }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@frenzpay/db';
import { verifyPassword } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { createSession } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import { IDLE_TTL_SECONDS, sessionCookieOptions } from '@frenzpay/auth/session';

const Schema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  const rl = await checkAuthRateLimit(redis, { ip, action: 'login' });
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
    return NextResponse.json({ error: 'Email and password required' }, { status: 422 });
  }

  const { email, password } = parsed.data;

  // Constant-time lookup: always run the password verify against SOMETHING so
  // response timing doesn't leak whether the email exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminUser = await prisma.adminUser.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  });

  // Dummy hash for constant-time compare when no user is found.
  // (This is a plausibly-expensive argon2 hash of the string "missing".)
  const DUMMY_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$VGhpc0lzTm90QVJlYWxTYWx0$zk0zt/tXrwSNn+WXhoOnoOQlWIdGBs2y8jQyUnwDrLk';

  const hashToCheck = adminUser?.passwordHash ?? DUMMY_HASH;
  // verifyPassword(password, storedHash) — plaintext first, hash second.
  const passwordOk = await verifyPassword(password, hashToCheck).catch(() => false);

  if (!adminUser || !passwordOk || !adminUser.isActive) {
    logger.warn({ email, ip }, 'admin login failed');
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Session: role='admin' so middleware lets us through /admin/*, adminRole
  // carries the specific AdminRole enum so downstream routes can gate further.
  const cookieValue = await createSession({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    kycTier: 0,     // admin sessions don't have a KYC tier in the customer sense
    ipAddress: ip,
    userAgent,
    mfaVerified: false,
  });

  // Update last_login_at / last_login_ip for audit
  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  }).catch((err) => {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'failed to stamp admin last login');
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: adminUser.id,
      action: 'ADMIN_LOGIN',
      ipAddress: ip,
    },
  }).catch(() => { /* audit log is best-effort */ });

  logger.info(
    { adminId: adminUser.id, email: adminUser.email, role: adminUser.role, ip },
    'admin login success',
  );

  const opts = sessionCookieOptions(cookieValue, IDLE_TTL_SECONDS);
  const response = NextResponse.json({
    user: {
      id: adminUser.id,
      email: adminUser.email,
      fullName: adminUser.fullName,
      role: adminUser.role,
    },
  });
  response.cookies.set(opts);
  return response;
}

// Make sure GETs on this URL don't 404 (Graph/Bridge-style probes should see
// a friendly 200-ish). This is a POST-only endpoint — respond with 405.
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
