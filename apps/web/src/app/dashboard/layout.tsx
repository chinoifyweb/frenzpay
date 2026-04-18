import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { MeProvider } from '@/hooks/use-me'

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
