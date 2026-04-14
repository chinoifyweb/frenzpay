'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowLeftRight,
  AlertTriangle,
  Settings,
  LogOut,
  Wallet,
  ScrollText,
} from 'lucide-react'

const sections = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Users',
    items: [
      { href: '/users', label: 'All Users', icon: Users },
      { href: '/kyc', label: 'KYC Queue', icon: ShieldCheck },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { href: '/wallets', label: 'Wallets', icon: Wallet },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { href: '/risk', label: 'Risk Flags', icon: AlertTriangle },
      { href: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  function logout() {
    Cookies.remove('admin_token')
    router.push('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-indigo-950 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-indigo-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">FrenzPay</p>
            <p className="text-indigo-400 text-xs">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {sections.map(section => (
          <div key={section.label}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                      active
                        ? 'bg-purple-600 text-white'
                        : 'text-indigo-300 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-indigo-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-indigo-400 hover:bg-indigo-800 hover:text-white w-full transition"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
