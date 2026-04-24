/**
 * POST /api/auth/login
 *
 * Flow:
 * 1. Rate limit: IP (20/15min) + soft user lookup (10/15min)
 * 2. Validate input
 * 3. Look up user by email
 * 4. Verify password (Argon2id) — always run hash even if user not found (timing)
 * 5. Check account status (FROZEN, SUSPENDED, DELETED)
 * 6. Record LoginAttempt
 * 7. If MFA enrolled → return mfaRequired + mfaChallengeToken (stored in Redis 5min)
 * 8. Else → create session, set cookie, return user
 *
 * Device fingerprinting:
 * - fingerprint = SHA-256(ip + userAgent + acceptLanguage)
 * - upsert Device record; new devices flagged for review
 *
 * Returns:
 *   200 { user }                              — fully logged in
 *   200 { mfaRequired: true, challengeToken } — needs TOTP step
 *   401 { error }                             — bad credentials
 *   403 { error }                             — frozen / suspended
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { verifyPassword } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';

// ─── Schema ───────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

/** Device fingerprint: deterministic hash of browser signals */
function deviceFingerprint(ip: string, userAgent: string, acceptLang: string): string {
  return createHash('sha256')
    .update(`${ip}|${userAgent}|${acceptLang}`)
    .digest('hex');
}

/** Dummy hash comparison to maintain constant-time when user not found */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getIp(request);
  const userAgent = request.headers.get('user-agent') ?? '';
  const acceptLang = request.headers.get('accept-language') ?? '';

  // 1. IP-level rate limit (before touching DB)
  const ipRl = await checkAuthRateLimit(redis, { ip, action: 'login' });
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(ipRl) },
    );
  }

  // 2. Validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // 3. Look up user
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      kycTier: true,
      emailVerified: true,
      mfaRequired: true,
      firstName: true,
      lastName: true,
      displayName: true,
      mfaSecrets: {
        where: { isActive: true, type: 'totp' },
        select: { id: true },
      },
    },
  });

  // 4. Verify password (always, to prevent timing attacks)
  const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
  const passwordValid = await verifyPassword(password, hashToVerify);

  // 5. Account checks
  if (!user || !passwordValid) {
    // Record failed attempt if user exists
    if (user) {
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          ipAddress: ip,
          userAgent,
          success: false,
          failReason: 'invalid_password',
        },
      }).catch(() => null); // non-fatal
    }
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (user.status === 'FROZEN') {
    return NextResponse.json(
      { error: 'Your account has been frozen. Contact support if this is a mistake.' },
      { status: 403 },
    );
  }

  if (user.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'Your account has been suspended. Contact support@frenzpay.co' },
      { status: 403 },
    );
  }

  if (user.status === 'DELETED') {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // User-level rate limit (now that we know the user ID)
  const userRl = await checkAuthRateLimit(redis, {
    ip,
    userId: user.id,
    action: 'login',
  });
  if (!userRl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts on this account. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(userRl) },
    );
  }

  // 6. Device fingerprint + upsert
  const fingerprint = deviceFingerprint(ip, userAgent, acceptLang);
  const device = await prisma.device.upsert({
    where: {
      // Prisma needs compound unique — use findFirst + create instead
      id: 'nonexistent-uuid', // will fail, trigger create
    },
    // Fallback: find or create
    create: {
      userId: user.id,
      fingerprint,
      userAgent,
      lastIp: ip,
      isTrusted: false,
    },
    update: {
      lastIp: ip,
      lastSeenAt: new Date(),
    },
  }).catch(async () => {
    // Upsert by fingerprint + userId
    const existing = await prisma.device.findFirst({
      where: { userId: user.id, fingerprint },
    });
    if (existing) {
      return prisma.device.update({
        where: { id: existing.id },
        data: { lastIp: ip, lastSeenAt: new Date() },
      });
    }
    return prisma.device.create({
      data: {
        userId: user.id,
        fingerprint,
        userAgent,
        lastIp: ip,
        isTrusted: false,
      },
    });
  });

  // 6b. Record successful login attempt
  await prisma.loginAttempt.create({
    data: {
      userId: user.id,
      email,
      ipAddress: ip,
      userAgent,
      success: true,
    },
  }).catch(() => null); // non-fatal

  logger.info({ userId: user.id, email }, 'login: successful');

  // 7. MFA check — require TOTP if user has active MFA secret
  const mfaEnrolled = user.mfaSecrets.length > 0 || user.mfaRequired;
  if (mfaEnrolled) {
    // Issue a short-lived MFA challenge token (5 min, single-use)
    const challengeToken = randomBytes(32).toString('hex');
    const challengeKey = `mfa_challenge:${challengeToken}`;
    await redis.set(
      challengeKey,
      JSON.stringify({ userId: user.id, deviceId: device.id, ip, userAgent }),
      'EX',
      300, // 5 minutes
    );

    return NextResponse.json({
      mfaRequired: true,
      challengeToken,
    });
  }

  // 8. Create session
  // Admin-role promotion: match the user's email against
  //   (a) FRENZPAY_ADMIN_EMAILS env var (comma-separated, case-insensitive), AND
  //   (b) a built-in bootstrap list below.
  // The built-in list exists so a brand-new deployment has a known-good admin
  // even if the env var isn't loaded in the runtime yet. Remove or lock this
  // list down once the admin_users lookup is wired in properly.
  const BOOTSTRAP_ADMIN_EMAILS = ['chinoify@gmail.com'];
  const envList = (process.env['FRENZPAY_ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const adminList = new Set<string>([...envList, ...BOOTSTRAP_ADMIN_EMAILS.map((e) => e.toLowerCase())]);
  const sessionRole = adminList.has(user.email.toLowerCase()) ? 'admin' : 'user';

  const cookieValue = await createSession({
    userId: user.id,
    email: user.email,
    role: sessionRole,
    kycTier: tierToNumber(user.kycTier),
    deviceId: device.id,
    ipAddress: ip,
    userAgent,
    mfaVerified: false,
  });

  // Also persist session record in DB for audit trail
  await prisma.session.create({
    data: {
      userId: user.id,
      token: createHash('sha256').update(cookieValue).digest('hex'),
      deviceId: device.id,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
    },
  }).catch(() => null); // non-fatal — Redis is source of truth

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
      kycTier: user.kycTier,
      emailVerified: user.emailVerified,
    },
  });

  response.cookies.set(
    sessionCookieOptions(cookieValue, 12 * 3600),
  );

  return response;
}

function tierToNumber(tier: string): number {
  const map: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
  return map[tier] ?? 0;
}
