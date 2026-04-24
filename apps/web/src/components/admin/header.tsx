'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowUpDown,
  ArrowUpRight,
  Settings,
  LogOut,
  ChevronRight,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AdminMobileSidebar } from './sidebar'
import { useMe, formatDisplayName, formatInitials } from '@/hooks/use-me'

const pageTitles: Record<string, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  '/admin':              { title: 'Dashboard',              icon: LayoutDashboard },
  '/admin/users':        { title: 'User Management',        icon: Users },
  '/admin/kyc':          { title: 'KYC Verification Queue', icon: ShieldCheck },
  '/admin/transactions': { title: 'Transaction Monitor',    icon: ArrowUpDown },
  '/admin/withdrawals':  { title: 'Withdrawal Management',  icon: ArrowUpRight },
  '/admin/providers':    { title: 'Provider Status',        icon: Zap },
  '/admin/flags':        { title: 'Risk & Fraud Flags',     icon: AlertTriangle },
  '/admin/settings':     { title: 'Platform Settings',      icon: Settings },
}

export function AdminHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { me, loading } = useMe()

  const page = pageTitles[pathname] || { title: 'Admin', icon: LayoutDashboard }
  const PageIcon = page.icon
  const displayName = loading ? '…' : formatDisplayName(me) || 'Admin'
  const initials = formatInitials(me) || 'AD'

  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) throw new Error()
      router.push('/admin-login')
      router.refresh()
    } catch {
      toast.error('Logout failed. Try again.')
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <AdminMobileSidebar />

      {/* Breadcrumb / Page Title */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground hidden sm:inline">Admin</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground hidden sm:inline" />
        <div className="flex items-center gap-2">
          <PageIcon className="h-4 w-4 text-orange-600" />
          <span className="font-semibold">{page.title}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Admin Avatar + Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted outline-none">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-orange-600 text-[10px] text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden sm:inline">{displayName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {me?.email && (
            <div className="px-2 py-1.5">
              <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/admin/settings" className="flex items-center gap-2 w-full cursor-pointer">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center gap-2 w-full cursor-pointer">
              <LayoutDashboard className="h-4 w-4" />
              Back to customer dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
