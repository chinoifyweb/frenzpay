import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { MeProvider } from '@/hooks/use-me'

export const metadata = {
  title: 'Admin Panel',
}

// Admin pages must never be cached at the edge — a stale OLS/CDN cache was
// why a logged-out admin could still see the dashboard for a while. Force
// every admin page to be dynamically rendered with no caching.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MeProvider>
      <div className="min-h-screen bg-muted/30">
        {/* Thin orange top bar to distinguish admin area */}
        <div className="h-1 bg-gradient-to-r from-orange-500 via-orange-600 to-red-600 fixed top-0 left-0 right-0 z-50" />

        <AdminSidebar />

        <div className="lg:pl-64 pt-1">
          <AdminHeader />
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </MeProvider>
  )
}
