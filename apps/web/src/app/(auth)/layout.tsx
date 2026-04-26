import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Frenz Pay',
    default: 'Frenz Pay',
  },
  description: 'Get paid globally, withdraw to any Nigerian bank account.',
}

// Auth pages must NEVER be statically prerendered + cached. The default
// Next.js prerender sets `Cache-Control: s-maxage=31536000` which lets
// LiteSpeed (and Cloudflare) cache the response. Their `vary`-header
// handling on RSC requests is unreliable — once an RSC binary stream is
// cached against a URL, a later HTML browser request can return the
// binary body and the user sees garbage on screen.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-xl font-bold">Frenz Pay</span>
          </Link>
          {children}
        </div>
      </div>
      {/* Right side - Branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary/90 to-secondary items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-3xl font-bold mb-4">
            Get paid globally. Withdraw to your Naira account.
          </h2>
          <p className="text-white/80 mb-8">
            Join thousands of freelancers and remote workers who use Frenz Pay to
            receive international payments — and cash out to their Nigerian bank.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-white font-semibold">&#10003;</span>
              </div>
              <span>Free USD, EUR &amp; NGN virtual accounts</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-white font-semibold">&#10003;</span>
              </div>
              <span>Withdraw to any Nigerian bank account</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-white font-semibold">&#10003;</span>
              </div>
              <span>Bank-grade security with 2FA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
