'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Wallet,
  ArrowUpDown,
  ArrowUpRight,
  Users,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Send,
  ShieldCheck,
  CreditCard,
  PiggyBank,
  Link2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Wallet,
  ArrowUpDown,
  ArrowUpRight,
  Users,
  Settings,
  Send,
  ShieldCheck,
  CreditCard,
  PiggyBank,
  Link2,
  AlertTriangle,
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.dashboard.map((item) => {
        const Icon = iconMap[item.icon]
        const isActive =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {Icon && <Icon className="size-4" />}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarUserMenu() {
  return (
    <div className="px-3 pb-4">
      <Separator className="mb-4" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              AJ
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium text-sm">Adekunle Johnson</p>
            <p className="truncate text-xs text-muted-foreground">adekunle@email.com</p>
          </div>
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8}>
          <DropdownMenuItem>
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex">
      <div className="flex h-14 items-center gap-2 px-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">F</span>
        </div>
        <span className="text-lg font-bold">Frenz Pay</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav />
      </div>
      <SidebarUserMenu />
    </aside>
  )
}

function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden" />
        }
      >
        <Menu className="size-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center gap-2 px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">F</span>
          </div>
          <span className="text-lg font-bold">Frenz Pay</span>
        </div>
        <div className="py-4">
          <SidebarNav />
        </div>
        <div className="mt-auto">
          <SidebarUserMenu />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { DesktopSidebar as DashboardSidebar, MobileSidebar }
