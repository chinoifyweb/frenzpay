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
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { verifyPassword } from '@frenzpay/auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@frenzpay/auth/rate-limit';
// session creation now happens in /api/auth/login/verify-otp after the
// email OTP is confirmed — the password-only step never mints a session.
import { redis } from '@/lib/redis';
import { logger } from '@frenzpay/logger';
import { sendLoginOtpEmail } from '@/lib/email';

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

  // 7. Second factor — TOTP if the user has Google Authenticator enrolled,
  //    otherwise email OTP. Either way the password-only step never mints
  //    a session; the verify endpoint does.
  //
  // The challenge token is the same shape regardless of which path the
  // user is on — the response just tells the UI which step to render
  // (`mfaMethod: 'totp' | 'email'`).
  const challengeToken = randomBytes(32).toString('hex');

  if (user.mfaSecrets.length > 0) {
    // TOTP path. The verify endpoint pulls the user's active MfaSecret
    // and runs verifyTotp() against the supplied 6-digit code. We just
    // hand it the userId + device identity in Redis so the session
    // gets minted with the right metadata.
    await redis.set(
      `mfa_challenge:${challengeToken}`,
      JSON.stringify({ userId: user.id, deviceId: device.id, ip, userAgent }),
      'EX',
      300, // 5 minutes — TOTP windows are tight, no need for 10
    );
    logger.info({ userId: user.id, email }, 'login: password ok, TOTP challenge issued');
    return NextResponse.json({
      requiresOtp: true,
      mfaMethod: 'totp' as const,
      challengeToken,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  }

  // Email OTP path. 6-digit code is generated server-side, hashed with
  // SHA-256 before landing in Redis (so a Redis-only compromise can't
  // read live codes), and bundled with everything the verify-otp route
  // needs to mint a session.
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = createHash('sha256').update(otp).digest('hex');

  await redis.set(
    `login_otp:${challengeToken}`,
    JSON.stringify({
      userId: user.id,
      otpHash,
      deviceId: device.id,
      ip,
      userAgent,
      attempts: 0,
    }),
    'EX',
    600, // 10 minutes
  );

  // Send the email out-of-band — don't fail the request if SMTP is slow.
  // Resend has a 3-5s ceiling so this is mostly insurance against transient
  // network blips; the user-visible "Code sent" message lands either way.
  void sendLoginOtpEmail(user.email, user.firstName ?? user.email, otp, { ip, userAgent }).catch(
    (err) => logger.warn(
      { userId: user.id, err: err instanceof Error ? err.message : err },
      'login OTP email failed',
    ),
  );

  logger.info({ userId: user.id, email }, 'login: password ok, email OTP issued');

  return NextResponse.json({
    requiresOtp: true,
    mfaMethod: 'email' as const,
    challengeToken,
    // Mask the email so the UI can show "...@gmail.com" without the user
    // having to remember which address they used.
    emailHint: maskEmail(user.email),
    // 10 minutes from now, so the UI can show a countdown if it wants.
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
}

/** "alice@gmail.com" → "a***e@gmail.com" — enough to recognise, not enough to leak. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}
