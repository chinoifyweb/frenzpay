'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useMe, formatDisplayName, formatInitials } from '@/hooks/use-me'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowUpDown,
  ArrowUpRight,
  AlertTriangle,
  Settings,
  Shield,
  Menu,
  LogOut,
  Zap,
  KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useState } from 'react'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowUpDown,
  ArrowUpRight,
  AlertTriangle,
  Settings,
  Zap,
  KeyRound,
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight">Frenz Pay</h1>
          <p className="text-[11px] font-medium uppercase tracking-wider text-orange-600">
            Admin
          </p>
        </div>
      </div>

      <Separator />

      {/* Nav Items */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.admin.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-orange-600/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive && 'text-orange-600 dark:text-orange-400'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* Admin user info */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <SidebarUserFooter />
        </div>
      </div>
    </div>
  )
}

function SidebarUserFooter() {
  const { me, loading } = useMe()
  const router = useRouter()

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
    <>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-orange-600 text-xs text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {me?.email ?? ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive"
        onClick={logout}
        aria-label="Log out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </>
  )
}

export function AdminSidebar() {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:top-1 border-r bg-background">
      <SidebarContent />
    </aside>
  )
}

export function AdminMobileSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
