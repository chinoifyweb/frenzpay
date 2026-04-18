/**
 * Next.js Edge Middleware
 *
 * Runs in the Edge runtime on every request matching config.matcher.
 * Imports only Edge-compatible modules (no Node.js net/crypto native addons).
 *
 * What it does:
 * 1. Unseal the session cookie (iron-session, uses Web Crypto API — Edge safe)
 * 2. Check absolute expiry from the cookie payload
 * 3. Route protection (requires auth, role-based, KYC tier gates)
 * 4. Redirect authenticated users away from auth pages
 * 5. Propagate x-user-id / x-user-role headers to downstream handlers for logging
 *
 * IMPORTANT: Middleware cannot reach Redis (no Node.js net module in Edge).
 * It trusts the sealed cookie for routing decisions only.
 * All API routes and Server Components MUST call getSession() from @/lib/session
 * which does the full Redis validation + revocation check.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';

// ─── Session types (inlined to avoid workspace package imports in Edge) ───────

interface CookieSession {
  sid: string;
  userId: string;
  role: string;
  kycTier: number;
  absoluteExpiry: number; // unix ms
}

const SESSION_COOKIE_NAME = 'frenzpay-session';

// ─── Route config ─────────────────────────────────────────────────────────────

/** Prefixes that require a valid session */
const PROTECTED_PREFIXES = ['/dashboard', '/author', '/settings'];

/** Exact auth pages — redirect away if already logged in */
const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);

/** KYC tier-1 required routes */
const KYC_T1_PREFIXES = [
  '/dashboard/transfer',
  '/dashboard/withdraw',
  '/dashboard/send',
  '/dashboard/receive',
];

/** KYC tier-2 required routes */
const KYC_T2_PREFIXES = ['/dashboard/cards'];

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    // Misconfigured server — fail open to avoid full outage
    console.error('[middleware] SESSION_SECRET not configured');
    return NextResponse.next();
  }

  // Unseal cookie
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session: CookieSession | null = null;

  if (rawCookie) {
    try {
      const data = await unsealData<CookieSession>(rawCookie, { password: secret, ttl: 0 });
      if (data?.sid && data?.userId && Date.now() < data.absoluteExpiry) {
        session = data;
      }
    } catch {
      // Tampered or invalid cookie — treat as unauthenticated
    }
  }

  const isAuthenticated = session !== null;

  // ── Redirect authenticated users away from auth pages ─────────────────────
  if (isAuthenticated && AUTH_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // ── Protect routes that require authentication ────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !isAuthenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isAuthenticated) return NextResponse.next();

  // From here: session is guaranteed non-null
  const { role, kycTier, userId } = session!;

  // ── Admin gate ────────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // ── KYC gates ─────────────────────────────────────────────────────────────
  if (KYC_T1_PREFIXES.some((p) => pathname.startsWith(p)) && kycTier < 1) {
    return NextResponse.redirect(new URL('/dashboard/kyc?required=1', request.url));
  }

  if (KYC_T2_PREFIXES.some((p) => pathname.startsWith(p)) && kycTier < 2) {
    return NextResponse.redirect(new URL('/dashboard/kyc?required=2', request.url));
  }

  // ── Propagate user context to downstream ─────────────────────────────────
  const response = NextResponse.next();
  response.headers.set('x-user-id', userId);
  response.headers.set('x-user-role', role);

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/author/:path*',
    '/admin/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
    '/forgot-password',
  ],
};
