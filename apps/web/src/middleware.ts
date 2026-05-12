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

  // Resolve the public-facing base URL so redirects never leak the
  // internal proxy target (e.g. localhost:3200) back to the browser.
  // Prefer, in order:
  //   1. x-forwarded-proto/host headers (set by OLS)
  //   2. the raw host header
  //   3. NEXT_PUBLIC_APP_URL env fallback
  //   4. request.url (last resort — can contain 127.0.0.1:3200)
  function publicUrl(path: string): URL {
    const fwdProto = request.headers.get('x-forwarded-proto');
    const fwdHost = request.headers.get('x-forwarded-host');
    const host = fwdHost ?? request.headers.get('host');
    if (host && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
      return new URL(path, `${fwdProto ?? 'https'}://${host}`);
    }
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) return new URL(path, envUrl);
    return new URL(path, request.url);
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

  // ── API routes: short-circuit auth with 401 JSON ─────────────────────────
  //
  // requireSession() inside route handlers calls redirect('/login') when
  // there's no session. For API routes that becomes a 307 → /login; the
  // browser fetch follows it, gets HTML, and JSON.parse blows up with
  // "Unexpected token '<' ... is not valid JSON". Catch unauthenticated
  // API hits here and return a proper 401 JSON instead so the client
  // can handle it gracefully.
  //
  // Allow-list of API paths that LEGITIMATELY accept anonymous
  // requests. Anything else under /api/* requires a session.
  const isPublicApi =
    pathname.startsWith('/api/auth/') ||         // login, signup, oauth, password reset, verify
    pathname.startsWith('/api/webhooks/') ||     // provider webhooks (signed)
    pathname.startsWith('/api/kyc-public/') ||   // token-signed doc serve to Graph
    pathname.startsWith('/api/cron/') ||         // cron secret in header
    pathname.startsWith('/api/dev/') ||          // sandbox-only helpers
    pathname.startsWith('/api/banks/') ||        // public bank lookup
    pathname === '/api/health' ||
    pathname === '/api/clear-cache' ||
    pathname === '/api/contact' ||
    pathname === '/api/waitlist';
  if (pathname.startsWith('/api/') && !isPublicApi && !isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (pathname.startsWith('/api/admin/') && isAuthenticated && session!.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Redirect authenticated users away from auth pages ─────────────────────
  if (isAuthenticated && AUTH_PAGES.has(pathname)) {
    return NextResponse.redirect(publicUrl('/dashboard'));
  }

  // ── Admin area uses its own login page ──────────────────────────────────
  // /admin/* pages are admin-only. Unauthenticated or non-admin users get
  // sent to /admin-login (not the customer /login) so admins sign in under
  // a dedicated surface that checks the admin_users table.
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    if (!isAuthenticated || session!.role !== 'admin') {
      const url = publicUrl('/admin-login');
      if (pathname !== '/admin') url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    // Authenticated admin — fall through to the downstream response below.
  }

  // ── Protect routes that require authentication (customer side) ────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !isAuthenticated) {
    const url = publicUrl('/login');
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (!isAuthenticated) return NextResponse.next();

  // From here: session is guaranteed non-null
  const { role, kycTier, userId } = session!;

  // ── KYC gates ─────────────────────────────────────────────────────────────
  if (KYC_T1_PREFIXES.some((p) => pathname.startsWith(p)) && kycTier < 1) {
    const url = publicUrl('/dashboard/kyc');
    url.searchParams.set('required', '1');
    return NextResponse.redirect(url);
  }

  if (KYC_T2_PREFIXES.some((p) => pathname.startsWith(p)) && kycTier < 2) {
    const url = publicUrl('/dashboard/kyc');
    url.searchParams.set('required', '2');
    return NextResponse.redirect(url);
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
    // Cover ALL API routes so unauthenticated requests get a 401 JSON
    // instead of redirecting to /login (which a fetch() call would
    // follow, get HTML, and choke on JSON.parse). The middleware's
    // isPublicApi allow-list keeps signup / webhooks / cron etc.
    // reachable without a session.
    '/api/:path*',
    // /admin-login is intentionally NOT matched — it's the public admin
    // login page and must stay reachable without a session.
    '/settings/:path*',
    '/login',
    '/signup',
    '/forgot-password',
  ],
};
