'use client'

import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowUpDown,
  ArrowUpRight,
  Settings,
  LogOut,
  ChevronRight,
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
import Link from 'next/link'

const pageTitles: Record<string, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  '/admin': { title: 'Dashboard', icon: LayoutDashboard },
  '/admin/users': { title: 'User Management', icon: Users },
  '/admin/kyc': { title: 'KYC Verification Queue', icon: ShieldCheck },
  '/admin/transactions': { title: 'Transaction Monitor', icon: ArrowUpDown },
  '/admin/withdrawals': { title: 'Withdrawal Management', icon: ArrowUpRight },
  '/admin/settings': { title: 'Platform Settings', icon: Settings },
}

export function AdminHeader() {
  const pathname = usePathname()
  const page = pageTitles[pathname] || { title: 'Admin', icon: LayoutDashboard }
  const PageIcon = page.icon

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
              SA
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden sm:inline">Super Admin</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="cursor-pointer">
            <Link href="/admin/settings" className="flex items-center gap-2 w-full">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer">
            <Link href="/dashboard" className="flex items-center gap-2 w-full">
              <LayoutDashboard className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer text-destructive">
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
