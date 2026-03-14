'use client'

import { useState, useMemo } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Transaction, TransactionType, TransactionStatus, Currency } from '@/types'
import { formatCurrency, formatDateTime, getCurrencyFlag } from '@/lib/utils'
import { toast } from 'sonner'

const allTransactions: Transaction[] = [
  { id: '1', user_id: '1', wallet_id: '1', type: 'credit', amount: 2500.00, currency: 'USD', fee: 0, net_amount: 2500.00, description: 'Payment from Upwork', reference: 'TXN-20260313-001', sender_name: 'Upwork Inc.', sender_bank: 'Wells Fargo', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-13T14:30:00Z' },
  { id: '2', user_id: '1', wallet_id: '1', type: 'debit', amount: 1000.00, currency: 'USD', fee: 15.00, net_amount: 985.00, description: 'USDT Withdrawal - TRC20', reference: 'WDR-20260312-001', sender_name: null, sender_bank: null, status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-12T10:15:00Z' },
  { id: '3', user_id: '1', wallet_id: '2', type: 'credit', amount: 750.00, currency: 'GBP', fee: 0, net_amount: 750.00, description: 'Payment from Client - Website Project', reference: 'TXN-20260311-002', sender_name: 'John Smith', sender_bank: 'Barclays', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-11T09:00:00Z' },
  { id: '4', user_id: '1', wallet_id: '3', type: 'credit', amount: 890.00, currency: 'EUR', fee: 0, net_amount: 890.00, description: 'Freelance payment - Design work', reference: 'TXN-20260310-003', sender_name: 'Design GmbH', sender_bank: 'Deutsche Bank', status: 'pending', provider_reference: null, metadata: null, created_at: '2026-03-10T16:45:00Z' },
  { id: '5', user_id: '1', wallet_id: '1', type: 'credit', amount: 3200.00, currency: 'USD', fee: 0, net_amount: 3200.00, description: 'Monthly salary - Remote Corp', reference: 'TXN-20260301-004', sender_name: 'Remote Corp LLC', sender_bank: 'Chase', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-03-01T12:00:00Z' },
  { id: '6', user_id: '1', wallet_id: '1', type: 'debit', amount: 500.00, currency: 'USD', fee: 7.50, net_amount: 492.50, description: 'USDT Withdrawal - ERC20', reference: 'WDR-20260228-002', sender_name: null, sender_bank: null, status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-28T15:20:00Z' },
  { id: '7', user_id: '1', wallet_id: '2', type: 'credit', amount: 1200.00, currency: 'GBP', fee: 0, net_amount: 1200.00, description: 'Consulting fee - Q1 report', reference: 'TXN-20260225-005', sender_name: 'Acme Ltd', sender_bank: 'HSBC', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-25T11:30:00Z' },
  { id: '8', user_id: '1', wallet_id: '1', type: 'credit', amount: 450.00, currency: 'USD', fee: 0, net_amount: 450.00, description: 'Logo design project', reference: 'TXN-20260220-006', sender_name: 'StartupXYZ', sender_bank: 'Silicon Valley Bank', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-20T09:15:00Z' },
  { id: '9', user_id: '1', wallet_id: '3', type: 'credit', amount: 620.00, currency: 'EUR', fee: 0, net_amount: 620.00, description: 'Translation services', reference: 'TXN-20260218-007', sender_name: 'TranslateEU', sender_bank: 'BNP Paribas', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-18T14:00:00Z' },
  { id: '10', user_id: '1', wallet_id: '1', type: 'debit', amount: 2000.00, currency: 'USD', fee: 30.00, net_amount: 1970.00, description: 'USDT Withdrawal - TRC20', reference: 'WDR-20260215-003', sender_name: null, sender_bank: null, status: 'failed', provider_reference: null, metadata: null, created_at: '2026-02-15T08:45:00Z' },
  { id: '11', user_id: '1', wallet_id: '1', type: 'credit', amount: 1800.00, currency: 'USD', fee: 0, net_amount: 1800.00, description: 'Fiverr project payout', reference: 'TXN-20260210-008', sender_name: 'Fiverr Inc.', sender_bank: 'Bank of America', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-10T16:30:00Z' },
  { id: '12', user_id: '1', wallet_id: '2', type: 'credit', amount: 320.00, currency: 'GBP', fee: 0, net_amount: 320.00, description: 'Content writing - Blog series', reference: 'TXN-20260205-009', sender_name: 'MediaCo UK', sender_bank: 'Lloyds', status: 'completed', provider_reference: null, metadata: null, created_at: '2026-02-05T10:00:00Z' },
]

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  pending: 'outline',
  failed: 'destructive',
}

const ITEMS_PER_PAGE = 8

export default function TransactionsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all')
  const [currencyFilter, setCurrencyFilter] = useState<'all' | Currency>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      if (statusFilter !== 'all' && tx.status !== statusFilter) return false
      if (currencyFilter !== 'all' && tx.currency !== currencyFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          tx.description.toLowerCase().includes(q) ||
          tx.reference.toLowerCase().includes(q) ||
          (tx.sender_name && tx.sender_name.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [search, typeFilter, statusFilter, currencyFilter])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const handleExport = () => {
    const csvHeader = 'Date,Description,Sender,Amount,Currency,Type,Status,Reference\n'
    const csvRows = filtered.map((tx) =>
      `"${tx.created_at}","${tx.description}","${tx.sender_name || ''}",${tx.amount},${tx.currency},${tx.type},${tx.status},"${tx.reference}"`
    ).join('\n')
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Transactions exported')
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by description, reference, or sender..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={currencyFilter}
                onChange={(e) => { setCurrencyFilter(e.target.value as typeof currencyFilter); setPage(1) }}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
              >
                <option value="all">All currencies</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(1) }}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
              >
                <option value="all">All types</option>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="size-4 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Filter className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No transactions found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(tx.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`flex size-7 items-center justify-center rounded-full shrink-0 ${
                              tx.type === 'credit' ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-red-100 dark:bg-red-950'
                            }`}>
                              {tx.type === 'credit' ? (
                                <ArrowDownLeft className="size-3.5 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="size-3.5 text-red-600" />
                              )}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {tx.description}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.sender_name || '--'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className={tx.type === 'credit' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                            {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{getCurrencyFlag(tx.currency)} {tx.currency}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[tx.status] || 'secondary'}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {tx.reference}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} transactions
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="px-2 text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
