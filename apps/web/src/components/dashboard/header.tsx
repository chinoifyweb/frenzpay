'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Bell, Settings, LogOut, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { MobileSidebar } from '@/components/dashboard/sidebar'
import { Badge } from '@/components/ui/badge'
import { useMe, formatDisplayName, formatInitials } from '@/hooks/use-me'
import { toast } from 'sonner'

const pageTitles: Record<string, string> = {
  '/dashboard':              'Overview',
  '/dashboard/wallet':       'Wallet',
  '/dashboard/send':         'Send',
  '/dashboard/activity':     'Activity',
  '/dashboard/cards':        'Cards',
  '/dashboard/savings':      'Savings',
  '/dashboard/withdraw':     'Withdraw',
  '/dashboard/kyc':          'Identity verification',
  '/dashboard/referrals':    'Refer & earn',
  '/dashboard/settings':     'Settings',
}

export function DashboardHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { me, loading } = useMe()
  const title = pageTitles[pathname] || 'Dashboard'

  const displayName = formatDisplayName(me)
  const initials = formatInitials(me)
  const firstName = me?.firstName ?? displayName.split(' ')[0] ?? ''
  const isVerified = (me?.kycTier ?? 'T0') !== 'T0'

  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) throw new Error()
      router.push('/login')
      router.refresh()
    } catch {
      toast.error('Logout failed. Try again.')
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8">
      <MobileSidebar />
      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {/* No synthetic notification count until the notifications store is wired */}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors disabled:opacity-60"
            disabled={loading}
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline-block">
              {firstName || (loading ? '…' : 'Account')}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{displayName || (loading ? 'Loading…' : 'Account')}</p>
              {me && <p className="text-xs text-muted-foreground truncate max-w-[220px]">{me.email}</p>}
              <div className="mt-1.5 flex gap-1">
                <Badge variant="secondary" className="text-[10px]">{me?.kycTier ?? 'T0'}</Badge>
                {isVerified && (
                  <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    Verified
                  </Badge>
                )}
                {me?.frenzTag?.tag && (
                  <Badge variant="outline" className="text-[10px] font-mono">@{me.frenzTag.tag}</Badge>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="flex w-full items-center gap-2 cursor-pointer">
                <UserIcon className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="flex w-full items-center gap-2 cursor-pointer">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
