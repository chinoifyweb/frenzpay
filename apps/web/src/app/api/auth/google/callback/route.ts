/**
 * GET /api/auth/google/callback
 *
 * Google redirects the browser here after the customer approves the
 * "Sign in with Google" prompt.
 *
 * Steps:
 *   1. Pull `code`, `state`, `error` from the query string.
 *   2. Validate state against the state cookie set by /start.
 *   3. POST the code to https://oauth2.googleapis.com/token to exchange
 *      it for an access_token + id_token (JWT).
 *   4. Decode the id_token's payload (no signature check — we just got
 *      the token straight from Google over TLS, the signature value
 *      adds little for a one-shot flow).
 *   5. Look up the user by google_sub first; if not, by lower-cased
 *      email. If no match, sign-up via Google (creates a User row
 *      with email_verified=true, no password set, googleSub recorded).
 *   6. Apply the same status / freeze / suspended checks as the
 *      password login.
 *   7. Mint a session cookie and bounce to the `next` path stored in
 *      the state cookie at /start.
 *
 * Any error along the way → redirect to /login with ?error=google_*.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { hashPassword } from '@frenzpay/auth';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { logger } from '@frenzpay/logger';

const STATE_COOKIE = 'frenzpay-google-oauth-state';

interface GoogleIdTokenPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return redirectToLogin(req, 'google_not_configured');
  }

  const errorParam = req.nextUrl.searchParams.get('error');
  if (errorParam) {
    // User declined the consent screen, or Google returned an error.
    return redirectToLogin(req, errorParam === 'access_denied' ? 'google_cancelled' : 'google_error');
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) {
    return redirectToLogin(req, 'google_missing_code');
  }

  // Compare incoming state to the cookie we set at /start. We also pull
  // `next` (the post-login destination) out of the cookie payload.
  const cookieRaw = req.cookies.get(STATE_COOKIE)?.value;
  if (!cookieRaw) return redirectToLogin(req, 'google_state_missing');

  let cookiePayload: { state: string; next: string };
  try { cookiePayload = JSON.parse(cookieRaw); }
  catch { return redirectToLogin(req, 'google_state_bad'); }

  if (cookiePayload.state !== state) {
    return redirectToLogin(req, 'google_state_mismatch');
  }

  // Exchange the auth code for tokens.
  const redirectUri = absoluteCallbackUrl(req);
  let tokenJson: { id_token?: string; access_token?: string; error?: string };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    tokenJson = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error || !tokenJson.id_token) {
      logger.warn(
        { status: tokenRes.status, body: tokenJson },
        'google token exchange failed',
      );
      return redirectToLogin(req, 'google_token_exchange');
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      'google token endpoint error',
    );
    return redirectToLogin(req, 'google_network');
  }

  const idTokenPayload = decodeJwtPayload(tokenJson.id_token!);
  if (!idTokenPayload?.sub || !idTokenPayload.email) {
    return redirectToLogin(req, 'google_id_token');
  }

  const email = idTokenPayload.email.toLowerCase().trim();
  const googleSub = idTokenPayload.sub;
  const emailVerified = !!idTokenPayload.email_verified;

  if (!emailVerified) {
    // Refuse Google accounts where email isn't verified at Google's end.
    return redirectToLogin(req, 'google_email_unverified');
  }

  // Match: existing googleSub > existing email > create.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let user: any = await prisma.user.findFirst({
    where: { googleSub },
    select: {
      id: true, email: true, status: true, kycTier: true,
      firstName: true, lastName: true, displayName: true,
      mfaSecrets: { where: { isActive: true, type: 'totp' }, select: { id: true } },
    },
  });

  if (!user) {
    user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, email: true, status: true, kycTier: true,
        firstName: true, lastName: true, displayName: true,
        mfaSecrets: { where: { isActive: true, type: 'totp' }, select: { id: true } },
      },
    });
    if (user) {
      // Email match — bind the Google sub to this account so future
      // sign-ins go through the faster googleSub path.
      await prisma.user.update({
        where: { id: user.id },
        data: { googleSub, emailVerified: true },
      });
    }
  }

  if (!user) {
    // Brand new sign-up via Google. Set a random password they can
    // never use directly — they always sign in via OAuth from now on.
    // Customer can set a real password later via /forgot-password.
    const randomPw = createHash('sha256').update(googleSub + Date.now()).digest('hex');
    const passwordHash = await hashPassword(randomPw);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        googleSub,
        emailVerified: true,
        firstName: idTokenPayload.given_name ?? null,
        lastName: idTokenPayload.family_name ?? null,
        displayName: idTokenPayload.name ?? null,
        avatarUrl: idTokenPayload.picture ?? null,
      },
      select: {
        id: true, email: true, status: true, kycTier: true,
        firstName: true, lastName: true, displayName: true,
        mfaSecrets: { where: { isActive: true, type: 'totp' }, select: { id: true } },
      },
    });
    logger.info({ userId: user.id, email }, 'google: new account created');
  }

  // Status checks identical to the password login.
  if (user.status === 'FROZEN' || user.status === 'SUSPENDED' || user.status === 'DELETED') {
    return redirectToLogin(req, 'google_account_blocked');
  }

  // OAuth flow ENDS the second-factor step too. Email is already
  // verified at Google. We honour the user's TOTP if enrolled — if so,
  // we DON'T mint a session here, instead we send them to a TOTP step
  // that finishes the sign-in. Keeps the second factor genuinely a
  // second factor.
  if (user.mfaSecrets.length > 0) {
    // Mint an mfa_challenge entry exactly like the password path so
    // /api/auth/mfa/totp-verify (mode: 'challenge') can consume it.
    const { randomBytes } = await import('node:crypto');
    const { redis } = await import('@/lib/redis');
    const challengeToken = randomBytes(32).toString('hex');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    const userAgent = req.headers.get('user-agent') ?? '';
    // Device upsert kept simple — same-IP/UA bucket, separate from the
    // password path's fingerprint match. Acceptable trade-off for
    // a minor surface; refine if multiple-device fraud shows up.
    const fingerprint = createHash('sha256').update(`${ip}|${userAgent}|google`).digest('hex');
    const device = await prisma.device.findFirst({ where: { userId: user.id, fingerprint } })
      ?? await prisma.device.create({
        data: { userId: user.id, fingerprint, userAgent, lastIp: ip, isTrusted: false },
      });
    await redis.set(
      `mfa_challenge:${challengeToken}`,
      JSON.stringify({ userId: user.id, deviceId: device.id, ip, userAgent }),
      'EX', 300,
    );
    const url = new URL('/login/totp', req.url);
    url.searchParams.set('challenge', challengeToken);
    url.searchParams.set('next', cookiePayload.next);
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  // No TOTP — mint the session directly.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const userAgent = req.headers.get('user-agent') ?? '';
  const fingerprint = createHash('sha256').update(`${ip}|${userAgent}|google`).digest('hex');
  const device = await prisma.device.findFirst({ where: { userId: user.id, fingerprint } })
    ?? await prisma.device.create({
      data: { userId: user.id, fingerprint, userAgent, lastIp: ip, isTrusted: false },
    });

  const cookieValue = await createSession({
    userId: user.id,
    email: user.email,
    role: 'user',
    kycTier: tierToNumber(user.kycTier),
    deviceId: device.id,
    ipAddress: ip,
    userAgent,
    mfaVerified: false,
  });
  await prisma.session.create({
    data: {
      userId: user.id,
      token: createHash('sha256').update(cookieValue).digest('hex'),
      deviceId: device.id,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
    },
  }).catch(() => null);

  const dest = new URL(cookiePayload.next, req.url);
  const res = NextResponse.redirect(dest);
  res.cookies.set(sessionCookieOptions(cookieValue, 12 * 3600));
  res.cookies.delete(STATE_COOKIE);
  logger.info({ userId: user.id }, 'google: sign-in success');
  return res;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function decodeJwtPayload(jwt: string): GoogleIdTokenPayload | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json) as GoogleIdTokenPayload;
  } catch { return null; }
}

function tierToNumber(tier: string): number {
  const map: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
  return map[tier] ?? 0;
}

function redirectToLogin(req: NextRequest, error: string): NextResponse {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', error);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

function absoluteCallbackUrl(req: NextRequest): string {
  const fwdProto = req.headers.get('x-forwarded-proto');
  const fwdHost = req.headers.get('x-forwarded-host');
  const host = fwdHost ?? req.headers.get('host');
  if (host && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    return `${fwdProto ?? 'https'}://${host}/api/auth/google/callback`;
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return new URL('/api/auth/google/callback', envUrl).toString();
  return new URL('/api/auth/google/callback', req.url).toString();
}
