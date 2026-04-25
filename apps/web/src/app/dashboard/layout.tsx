import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { MeProvider } from '@/hooks/use-me'

// Dashboard pages depend on session state (KYC tier, balances, etc) and
// must NEVER be served from a static prerender + cache. Without this,
// Next.js stamps responses with `Cache-Control: s-maxage=31536000` and
// LiteSpeed caches them, with the well-known `vary` mishandling on RSC
// requests that returns binary streams to HTML browser navigations.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <div className="min-h-screen bg-muted/30">
        <DashboardSidebar />
        <div className="lg:pl-64">
          <DashboardHeader />
          <main className="p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </MeProvider>
  )
}
