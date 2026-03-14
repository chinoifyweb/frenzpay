'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import type { AdminStats, Transaction } from '@/types'
import Link from 'next/link'

const mockAdminStats: AdminStats = {
  total_users: 10432,
  active_users: 8291,
  total_volume: 2450000,
  pending_kyc: 23,
  pending_withdrawals: 8,
  revenue_from_fees: 36750,
  new_users_today: 47,
  new_users_this_week: 312,
}

const volumeData = [
  { date: 'Feb 12', volume: 42000 },
  { date: 'Feb 14', volume: 55000 },
  { date: 'Feb 16', volume: 48000 },
  { date: 'Feb 18', volume: 71000 },
  { date: 'Feb 20', volume: 63000 },
  { date: 'Feb 22', volume: 89000 },
  { date: 'Feb 24', volume: 78000 },
  { date: 'Feb 26', volume: 95000 },
  { date: 'Feb 28', volume: 82000 },
  { date: 'Mar 02', volume: 110000 },
  { date: 'Mar 04', volume: 97000 },
  { date: 'Mar 06', volume: 125000 },
  { date: 'Mar 08', volume: 115000 },
  { date: 'Mar 10', volume: 138000 },
  { date: 'Mar 12', volume: 142000 },
]

const newUsersData = [
  { day: 'Mon', users: 38 },
  { day: 'Tue', users: 52 },
  { day: 'Wed', users: 41 },
  { day: 'Thu', users: 67 },
  { day: 'Fri', users: 55 },
  { day: 'Sat', users: 29 },
  { day: 'Sun', users: 30 },
]

const recentTransactions: (Transaction & { user_name: string })[] = [
  {
    id: 'txn_001',
    user_id: 'u_001',
    wallet_id: 'w_001',
    type: 'credit',
    amount: 2500.0,
    currency: 'USD',
    fee: 0,
    net_amount: 2500.0,
    description: 'Wire transfer received',
    reference: 'REF-2026-001',
    sender_name: 'Acme Corp',
    sender_bank: 'Chase Bank',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-14T10:23:00Z',
    user_name: 'Adebayo Johnson',
  },
  {
    id: 'txn_002',
    user_id: 'u_002',
    wallet_id: 'w_002',
    type: 'credit',
    amount: 1800.5,
    currency: 'GBP',
    fee: 0,
    net_amount: 1800.5,
    description: 'Client payment',
    reference: 'REF-2026-002',
    sender_name: 'London Digital Ltd',
    sender_bank: 'Barclays',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-14T09:45:00Z',
    user_name: 'Chioma Okafor',
  },
  {
    id: 'txn_003',
    user_id: 'u_003',
    wallet_id: 'w_003',
    type: 'debit',
    amount: 500.0,
    currency: 'USD',
    fee: 7.5,
    net_amount: 492.5,
    description: 'USDT withdrawal',
    reference: 'REF-2026-003',
    sender_name: null,
    sender_bank: null,
    status: 'pending',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-14T08:12:00Z',
    user_name: 'Emeka Nwosu',
  },
  {
    id: 'txn_004',
    user_id: 'u_004',
    wallet_id: 'w_004',
    type: 'credit',
    amount: 3200.0,
    currency: 'EUR',
    fee: 0,
    net_amount: 3200.0,
    description: 'Freelance payment',
    reference: 'REF-2026-004',
    sender_name: 'Berlin Tech GmbH',
    sender_bank: 'Deutsche Bank',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-14T07:30:00Z',
    user_name: 'Fatima Bello',
  },
  {
    id: 'txn_005',
    user_id: 'u_005',
    wallet_id: 'w_005',
    type: 'credit',
    amount: 750.0,
    currency: 'USD',
    fee: 0,
    net_amount: 750.0,
    description: 'Invoice payment',
    reference: 'REF-2026-005',
    sender_name: 'StartupX Inc',
    sender_bank: 'Bank of America',
    status: 'failed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T22:15:00Z',
    user_name: 'Oluwaseun Ade',
  },
  {
    id: 'txn_006',
    user_id: 'u_006',
    wallet_id: 'w_006',
    type: 'debit',
    amount: 1200.0,
    currency: 'GBP',
    fee: 18.0,
    net_amount: 1182.0,
    description: 'USDT withdrawal',
    reference: 'REF-2026-006',
    sender_name: null,
    sender_bank: null,
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T20:05:00Z',
    user_name: 'Ibrahim Musa',
  },
  {
    id: 'txn_007',
    user_id: 'u_007',
    wallet_id: 'w_007',
    type: 'credit',
    amount: 4100.0,
    currency: 'USD',
    fee: 0,
    net_amount: 4100.0,
    description: 'Contract payment',
    reference: 'REF-2026-007',
    sender_name: 'Global Solutions LLC',
    sender_bank: 'Wells Fargo',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T18:40:00Z',
    user_name: 'Ngozi Eze',
  },
  {
    id: 'txn_008',
    user_id: 'u_008',
    wallet_id: 'w_008',
    type: 'credit',
    amount: 620.0,
    currency: 'EUR',
    fee: 0,
    net_amount: 620.0,
    description: 'Service fee',
    reference: 'REF-2026-008',
    sender_name: 'Paris Design Studio',
    sender_bank: 'BNP Paribas',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T16:20:00Z',
    user_name: 'David Obi',
  },
  {
    id: 'txn_009',
    user_id: 'u_009',
    wallet_id: 'w_009',
    type: 'debit',
    amount: 2000.0,
    currency: 'USD',
    fee: 30.0,
    net_amount: 1970.0,
    description: 'USDT withdrawal',
    reference: 'REF-2026-009',
    sender_name: null,
    sender_bank: null,
    status: 'pending',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T14:55:00Z',
    user_name: 'Aisha Yusuf',
  },
  {
    id: 'txn_010',
    user_id: 'u_010',
    wallet_id: 'w_010',
    type: 'credit',
    amount: 950.0,
    currency: 'GBP',
    fee: 0,
    net_amount: 950.0,
    description: 'Consulting fee',
    reference: 'REF-2026-010',
    sender_name: 'Manchester Consulting',
    sender_bank: 'HSBC',
    status: 'completed',
    provider_reference: null,
    metadata: null,
    created_at: '2026-03-13T12:10:00Z',
    user_name: 'Kemi Adeyemi',
  },
]

function StatCard({
  title,
  value,
  icon: Icon,
  change,
  alert,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  change?: string
  alert?: number
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="relative">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {alert && alert > 0 ? (
              <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                {alert}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{value}</p>
          {change && (
            <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>{change}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={mockAdminStats.total_users.toLocaleString()}
          icon={Users}
          change={`+12% from last month`}
        />
        <StatCard
          title="Total Volume Processed"
          value={formatCurrency(mockAdminStats.total_volume)}
          icon={DollarSign}
          change="+8.2% this week"
        />
        <StatCard
          title="Pending KYC Applications"
          value={mockAdminStats.pending_kyc.toString()}
          icon={ShieldCheck}
          alert={mockAdminStats.pending_kyc}
        />
        <StatCard
          title="Revenue from Fees"
          value={formatCurrency(mockAdminStats.revenue_from_fees)}
          icon={TrendingUp}
          change="+15.3% this month"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Volume Processed (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), 'Volume']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--background))',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#ea580c"
                    fill="#ea580c"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* New Users Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Users (This Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={newUsersData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value) => [String(value), 'New Users']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--background))',
                    }}
                  />
                  <Bar
                    dataKey="users"
                    fill="#ea580c"
                    radius={[4, 4, 0, 0]}
                    fillOpacity={0.85}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions + Pending Items */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <Link
              href="/admin/transactions"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="font-medium">{txn.user_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={txn.type === 'credit' ? 'default' : 'secondary'}
                          className={
                            txn.type === 'credit'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }
                        >
                          {txn.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(txn.amount, txn.currency)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            txn.status === 'completed'
                              ? 'default'
                              : txn.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                          className={
                            txn.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : txn.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }
                        >
                          {txn.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDateTime(txn.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pending Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link
              href="/admin/kyc"
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <ShieldCheck className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">KYC Queue</p>
                  <p className="text-xs text-muted-foreground">
                    {mockAdminStats.pending_kyc} applications pending
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>

            <Link
              href="/admin/withdrawals"
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <ArrowUpRight className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Pending Withdrawals</p>
                  <p className="text-xs text-muted-foreground">
                    {mockAdminStats.pending_withdrawals} awaiting review
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>

            <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Flagged Transactions</p>
                  <p className="text-xs text-muted-foreground">
                    3 transactions need review
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Quick Stats */}
            <div className="mt-6 space-y-3 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Users</span>
                <span className="font-medium">
                  {mockAdminStats.active_users.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New Today</span>
                <span className="font-medium text-green-600">
                  +{mockAdminStats.new_users_today}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New This Week</span>
                <span className="font-medium text-green-600">
                  +{mockAdminStats.new_users_this_week}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
