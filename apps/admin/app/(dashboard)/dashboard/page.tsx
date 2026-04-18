'use client'

import { useEffect, useState } from 'react'
import { api, type AdminStats } from '@/lib/api'
import {
  Users,
  ShieldCheck,
  ArrowLeftRight,
  DollarSign,
  TrendingUp,
  UserCheck,
  Activity,
  RefreshCw,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
  subColor = 'text-gray-400',
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  sub?: string
  subColor?: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
    </div>
  )
}

function ChartCard({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  function load() {
    setLoading(true)
    api
      .stats()
      .then(s => {
        setStats(s)
        setLastUpdated(new Date())
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (error)
    return (
      <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
        Failed to load stats: {error}
      </div>
    )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString()}`
              : 'Platform overview'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      ) : stats ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Total Users"
              value={stats.total_users.toLocaleString()}
              icon={Users}
              color="bg-purple-500"
              sub={`${stats.active_users.toLocaleString()} active accounts`}
            />
            <StatCard
              label="Active Users"
              value={stats.active_users.toLocaleString()}
              icon={UserCheck}
              color="bg-emerald-500"
              sub={`${((stats.active_users / Math.max(stats.total_users, 1)) * 100).toFixed(1)}% of total`}
            />
            <StatCard
              label="KYC Pending"
              value={stats.kyc_pending}
              icon={ShieldCheck}
              color={stats.kyc_pending > 0 ? 'bg-amber-500' : 'bg-gray-400'}
              sub={stats.kyc_pending > 0 ? 'Awaiting review' : 'Queue clear'}
              subColor={stats.kyc_pending > 0 ? 'text-amber-500' : 'text-gray-400'}
            />
            <StatCard
              label="Transactions Today"
              value={stats.transactions_today.toLocaleString()}
              icon={ArrowLeftRight}
              color="bg-blue-500"
            />
            <StatCard
              label="Revenue Today"
              value={`$${Number(stats.revenue_today).toFixed(2)}`}
              icon={DollarSign}
              color="bg-green-500"
              sub="Platform fees earned"
            />
            <StatCard
              label="Revenue This Month"
              value={`$${Number(stats.revenue_month).toFixed(2)}`}
              icon={TrendingUp}
              color="bg-indigo-500"
              sub="Cumulative MTD"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Daily Signups" sub="New registrations — last 30 days">
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={stats.daily_signups}>
                  <defs>
                    <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={d => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip labelFormatter={d => `Date: ${d}`} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    fill="url(#signupGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Daily Revenue (fees)" sub="Platform fee income — last 30 days">
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={stats.daily_revenue}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={d => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Quick-links */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Review KYC', sub: `${stats.kyc_pending} pending`, href: '/kyc', accent: 'border-amber-200 hover:border-amber-400' },
              { label: 'All Transactions', sub: `${stats.transactions_today} today`, href: '/transactions', accent: 'border-blue-200 hover:border-blue-400' },
              { label: 'User Management', sub: `${stats.total_users.toLocaleString()} total`, href: '/users', accent: 'border-purple-200 hover:border-purple-400' },
              { label: 'Platform Settings', sub: 'Config & services', href: '/settings', accent: 'border-gray-200 hover:border-gray-400' },
            ].map(link => (
              <a
                key={link.href}
                href={link.href}
                className={`bg-white rounded-xl p-4 shadow-sm border-2 transition ${link.accent} group`}
              >
                <p className="font-semibold text-gray-900 text-sm group-hover:text-purple-700 transition">
                  {link.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{link.sub}</p>
              </a>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
