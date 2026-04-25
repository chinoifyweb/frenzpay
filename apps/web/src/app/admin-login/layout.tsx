/**
 * Layout shim for /admin-login that opts the route OUT of Next.js's
 * default static prerender. Without this, Next.js stamps the response
 * with `Cache-Control: s-maxage=31536000` and LiteSpeed caches it for
 * a year. LiteSpeed's `vary` handling on RSC requests is unreliable
 * — a previously cached RSC binary stream gets returned to a later
 * HTML browser request and the user sees binary garbage on screen.
 *
 * Forcing dynamic rendering keeps every visit to /admin-login
 * uncacheable so the issue can't recur.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
