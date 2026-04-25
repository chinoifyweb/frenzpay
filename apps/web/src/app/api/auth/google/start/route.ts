/**
 * GET /api/auth/google/start
 *
 * Kicks off the "Sign in with Google" flow:
 *   1. Generate a random 32-byte state value, store it as an HttpOnly,
 *      Secure cookie scoped to /api/auth/google/. The callback compares
 *      the cookie back against the `state` Google echoes — protects
 *      against CSRF and against an attacker swapping in their own code.
 *   2. (Optionally) accept ?next=/some/path so the customer lands back
 *      where they started — sanity-checked to a same-origin path so
 *      we can't be turned into an open redirect.
 *   3. Redirect the browser to Google's authorize endpoint with our
 *      client_id, the configured redirect URL, scope=openid email
 *      profile, prompt=select_account so the user can pick which
 *      Google account they're linking.
 *
 * Gracefully no-op when GOOGLE_CLIENT_ID isn't set — returns a 503 so
 * the UI button can show "Google sign-in not configured" instead of
 * sending the customer through a half-built flow.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

const STATE_COOKIE = 'frenzpay-google-oauth-state';
const STATE_TTL_SECONDS = 600; // 10 minutes
const SCOPE = 'openid email profile';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google sign-in is not configured on this environment.' },
      { status: 503 },
    );
  }

  // Where to land the customer after the callback finishes. Same-origin
  // only — anything else is silently dropped to /dashboard so we can't
  // be hijacked into bouncing users to attacker-controlled URLs.
  const rawNext = req.nextUrl.searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  const redirectUri = absoluteCallbackUrl(req);
  const state = randomBytes(32).toString('hex');

  // Bundle the post-login destination into the state cookie so we don't
  // have to round-trip it through Google. We sign the cookie's value
  // implicitly via httpOnly + secure + sameSite — this isn't sensitive
  // data, just CSRF defence.
  const cookieValue = JSON.stringify({ state, next });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
  });
  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax', // 'lax' is required so the cookie comes back on Google's redirect
    path: '/api/auth/google',
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}

/** Build the public callback URL using the same logic as middleware. */
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
