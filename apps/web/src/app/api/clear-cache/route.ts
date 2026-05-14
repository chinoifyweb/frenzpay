/**
 * GET /api/clear-cache
 *
 * Browser cache evict endpoint. Visit it once and the browser drops
 * EVERY stored asset (HTML, CSS, JS, service-worker caches, cookies)
 * for the frenzpay.co + app.frenzpay.co origins.
 *
 * Why this exists: a deploy in early April 2026 stamped `Cache-Control:
 * s-maxage=31536000` on auth pages (Next.js's default for prerendered
 * routes). Browsers that hit the site during that window pinned the
 * HTML for a year. Those entries render as binary garbage now because
 * the cached body is the OLD prerendered RSC stream, decoded against
 * the NEW HTML structure the browser expects from a normal navigation.
 *
 * The fix already shipped (auth pages now send no-store), but doesn't
 * help a browser that already has the bad entry — the browser doesn't
 * even ask the server because its cache says the response is fresh.
 *
 * Visiting this route forces the browser to issue a request, and the
 * response carries `Clear-Site-Data: "cache", "storage"` which all
 * modern browsers honour by dropping every cache + IndexedDB entry
 * for the origin. After that, the next navigation is a clean refetch
 * of the new no-cache headers and the issue can never come back.
 *
 * The route then redirects to /admin-login so the admin lands on a
 * working page immediately after the cache wipe.
 */

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Default to homepage — works for both customers and admins. If the
  // caller knows where they want to land they pass ?next=/some/path.
  const next = url.searchParams.get('next') || '/';
  // Only allow same-origin redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  // Rebuild the public-facing origin from the forwarded headers — the
  // raw request URL is `http://localhost:3200/...` because Next.js
  // standalone is behind LSWS, and constructing the redirect against
  // that origin would dump customers on a non-routable URL.
  const fwdProto = req.headers.get('x-forwarded-proto');
  const fwdHost = req.headers.get('x-forwarded-host');
  const host = fwdHost ?? req.headers.get('host');
  const publicOrigin =
    host && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')
      ? `${fwdProto ?? 'https'}://${host}`
      : url.origin;

  const res = NextResponse.redirect(new URL(safeNext, publicOrigin), { status: 302 });
  // Wipe everything browser-side for this origin. The 'cache' directive
  // alone fixes the disk-cache pinning; 'storage' also clears IDB +
  // localStorage as a belt+braces in case the SW left stale entries.
  res.headers.set('Clear-Site-Data', '"cache", "storage"');
  // Don't let the redirect itself get cached.
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}
