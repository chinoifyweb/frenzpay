'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Share2,
  UserPlus,
  ArrowDownLeft,
  ArrowUpRight as ArrowUpRightIcon,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Wallet, Transaction } from '@/types'
import { formatCurrency, formatDateTime, getCurrencyFlag } from '@/lib/utils'
import { toast } from 'sonner'

const mockUser = {
  full_name: 'Adekunle Johnson',
  kyc_status: 'verified' as const,
}

const mockWallets: Wallet[] = [
  { id: '1', user_id: '1', currency: 'USD', balance: 5420.50, available_balance: 5420.50, ledger_balance: 5420.50, is_active: true, created_at: '2026-01-15', updated_at: '2026-03-14' },
  { id: '2', user_id: '1', currency: 'GBP', balance: 1230.75, available_balance: 1230.75, ledger_balance: 1230.75, is_active: true, created_at: '2026-01-15', updated_at: '2026-03-14' },
  { id: '3', user_id: '1', currency: 'EUR', balance: 890.00, available_balance: 890.00, ledger_balance: 890.00, is_active: true, created_at: '2026-01-15', updated_at: '2026-03-14' },
]

const mockTransactions: Transaction[] = [
  { id: '1', user_id: '1', wallet_id: '1', type: 'credit', amount: 2500.00, currency: 'USD', fee: 0, net_amount: 2500.00, description: 'Payment from Upwork', reference: 'TXN001', sender_name: 'Upwork Inc.', sender_bank: 'Wells Fargo', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-13T14:30:00Z' },
  { id: '2', user_id: '1', wallet_id: '1', type: 'debit', amount: 1000.00, currency: 'USD', fee: 15.00, net_amount: 985.00, description: 'USDT Withdrawal', reference: 'WDR001', sender_name: null, sender_bank: null, status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-12T10:15:00Z' },
  { id: '3', user_id: '1', wallet_id: '2', type: 'credit', amount: 750.00, currency: 'GBP', fee: 0, net_amount: 750.00, description: 'Payment from Client - Website Project', reference: 'TXN002', sender_name: 'John Smith', sender_bank: 'Barclays', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-11T09:00:00Z' },
  { id: '4', user_id: '1', wallet_id: '3', type: 'credit', amount: 890.00, currency: 'EUR', fee: 0, net_amount: 890.00, description: 'Freelance payment - Design work', reference: 'TXN003', sender_name: 'Design GmbH', sender_bank: 'Deutsche Bank', status: 'pending', provider_reference: null, metadata: null, created_at: '2026-03-10T16:45:00Z' },
  { id: '5', user_id: '1', wallet_id: '1', type: 'credit', amount: 3200.00, currency: 'USD', fee: 0, net_amount: 3200.00, description: 'Monthly salary - Remote Corp', reference: 'TXN004', sender_name: 'Remote Corp LLC', sender_bank: 'Chase', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-01T12:00:00Z' },
]

const currencyColors: Record<string, string> = {
  USD: 'border-t-blue-500',
  GBP: 'border-t-purple-500',
  EUR: 'border-t-emerald-500',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  pending: 'outline',
  failed: 'destructive',
}

export default function DashboardPage() {
  const [showBalances, setShowBalances] = useState(true)

  return (
    <div className="space-y-6">
      {/* KYC Banner - shown if not verified */}
      {mockUser.kyc_status !== 'verified' && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
          <AlertCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Complete your KYC verification
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Verify your identity to unlock withdrawals and higher limits.
            </p>
          </div>
          <Link href="/dashboard/settings">
            <Button size="sm">Verify Now</Button>
          </Link>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back, {mockUser.full_name.split(' ')[0]}!
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">Here is your account overview</p>
            <Badge
              variant={mockUser.kyc_status === 'verified' ? 'default' : 'outline'}
              className="text-[10px]"
            >
              <CheckCircle2 className="size-3 mr-0.5" />
              {mockUser.kyc_status === 'verified' ? 'KYC Verified' : 'Unverified'}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBalances(!showBalances)}
        >
          {showBalances ? <EyeOff className="size-4 mr-1.5" /> : <Eye className="size-4 mr-1.5" />}
          {showBalances ? 'Hide balances' : 'Show balances'}
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockWallets.map((wallet) => (
          <Card key={wallet.id} className={`border-t-4 ${currencyColors[wallet.currency]}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCurrencyFlag(wallet.currency)}</span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {wallet.currency} Account
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px]">Active</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-3xl font-bold tracking-tight">
                  {showBalances ? formatCurrency(wallet.balance, wallet.currency) : '****'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Available: {showBalances ? formatCurrency(wallet.available_balance, wallet.currency) : '****'}
                </p>
              </div>
              <Link href="/dashboard/accounts" className="mt-4 block">
                <Button variant="outline" size="sm" className="w-full">
                  View Account
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/dashboard/withdraw">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 py-1">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ArrowUpRight className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Withdraw to USDT</p>
                <p className="text-xs text-muted-foreground">Convert and withdraw</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/accounts">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 py-1">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Share2 className="size-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Share Account Details</p>
                <p className="text-xs text-muted-foreground">Send to your clients</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/referrals">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 py-1">
              <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10">
                <UserPlus className="size-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Invite Friends</p>
                <p className="text-xs text-muted-foreground">Earn $5 per referral</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Link href="/dashboard/transactions">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(tx.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`flex size-7 items-center justify-center rounded-full ${
                        tx.type === 'credit' ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-red-100 dark:bg-red-950'
                      }`}>
                        {tx.type === 'credit' ? (
                          <ArrowDownLeft className="size-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpRightIcon className="size-3.5 text-red-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        {tx.sender_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            from {tx.sender_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={tx.type === 'credit' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[tx.status] || 'secondary'}>
                      {tx.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
