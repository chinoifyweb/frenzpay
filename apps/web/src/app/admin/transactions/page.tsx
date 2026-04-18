'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Search,
  Download,
  Filter,
  Eye,
  AlertTriangle,
  Flag,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils'
import type { Transaction, TransactionStatus, TransactionType, Currency } from '@/types'

interface TransactionWithUser extends Transaction {
  user_name: string
  user_email: string
  flagged?: boolean
}

const mockTransactions: TransactionWithUser[] = [
  { id: 'txn_001', user_id: 'u_001', wallet_id: 'w_001', type: 'credit', amount: 2500.00, currency: 'USD', fee: 0, net_amount: 2500.00, description: 'Wire transfer received', reference: 'REF-2026-001', sender_name: 'Acme Corp', sender_bank: 'Chase Bank', status: 'completed', provider_reference: 'PR-001', metadata: null, created_at: '2026-03-14T10:23:00Z', user_name: 'Adebayo Johnson', user_email: 'adebayo@gmail.com' },
  { id: 'txn_002', user_id: 'u_002', wallet_id: 'w_002', type: 'credit', amount: 1800.50, currency: 'GBP', fee: 0, net_amount: 1800.50, description: 'Client payment', reference: 'REF-2026-002', sender_name: 'London Digital Ltd', sender_bank: 'Barclays', status: 'completed', provider_reference: 'PR-002', metadata: null, created_at: '2026-03-14T09:45:00Z', user_name: 'Chioma Okafor', user_email: 'chioma@yahoo.com' },
  { id: 'txn_003', user_id: 'u_003', wallet_id: 'w_003', type: 'debit', amount: 500.00, currency: 'USD', fee: 7.50, net_amount: 492.50, description: 'USDT withdrawal', reference: 'REF-2026-003', sender_name: null, sender_bank: null, status: 'pending', provider_reference: null, metadata: null, created_at: '2026-03-14T08:12:00Z', user_name: 'Emeka Nwosu', user_email: 'emeka@outlook.com' },
  { id: 'txn_004', user_id: 'u_004', wallet_id: 'w_004', type: 'credit', amount: 3200.00, currency: 'EUR', fee: 0, net_amount: 3200.00, description: 'Freelance payment', reference: 'REF-2026-004', sender_name: 'Berlin Tech GmbH', sender_bank: 'Deutsche Bank', status: 'completed', provider_reference: 'PR-004', metadata: null, created_at: '2026-03-14T07:30:00Z', user_name: 'Fatima Bello', user_email: 'fatima@gmail.com' },
  { id: 'txn_005', user_id: 'u_005', wallet_id: 'w_005', type: 'credit', amount: 750.00, currency: 'USD', fee: 0, net_amount: 750.00, description: 'Invoice payment', reference: 'REF-2026-005', sender_name: 'StartupX Inc', sender_bank: 'Bank of America', status: 'failed', provider_reference: null, metadata: null, created_at: '2026-03-13T22:15:00Z', user_name: 'Oluwaseun Ade', user_email: 'oluwaseun@gmail.com' },
  { id: 'txn_006', user_id: 'u_006', wallet_id: 'w_006', type: 'debit', amount: 1200.00, currency: 'GBP', fee: 18.00, net_amount: 1182.00, description: 'USDT withdrawal', reference: 'REF-2026-006', sender_name: null, sender_bank: null, status: 'completed', provider_reference: 'PR-006', metadata: null, created_at: '2026-03-13T20:05:00Z', user_name: 'Ibrahim Musa', user_email: 'ibrahim@hotmail.com' },
  { id: 'txn_007', user_id: 'u_007', wallet_id: 'w_007', type: 'credit', amount: 4100.00, currency: 'USD', fee: 0, net_amount: 4100.00, description: 'Contract payment', reference: 'REF-2026-007', sender_name: 'Global Solutions LLC', sender_bank: 'Wells Fargo', status: 'completed', provider_reference: 'PR-007', metadata: null, created_at: '2026-03-13T18:40:00Z', user_name: 'Ngozi Eze', user_email: 'ngozi@gmail.com' },
  { id: 'txn_008', user_id: 'u_008', wallet_id: 'w_008', type: 'credit', amount: 15000.00, currency: 'USD', fee: 0, net_amount: 15000.00, description: 'Large transfer received', reference: 'REF-2026-008', sender_name: 'Unknown Sender LLC', sender_bank: 'Offshore Bank', status: 'completed', provider_reference: 'PR-008', metadata: null, created_at: '2026-03-13T16:20:00Z', user_name: 'David Obi', user_email: 'david@yahoo.com', flagged: true },
  { id: 'txn_009', user_id: 'u_009', wallet_id: 'w_009', type: 'debit', amount: 2000.00, currency: 'USD', fee: 30.00, net_amount: 1970.00, description: 'USDT withdrawal', reference: 'REF-2026-009', sender_name: null, sender_bank: null, status: 'pending', provider_reference: null, metadata: null, created_at: '2026-03-13T14:55:00Z', user_name: 'Aisha Yusuf', user_email: 'aisha@gmail.com' },
  { id: 'txn_010', user_id: 'u_010', wallet_id: 'w_010', type: 'credit', amount: 950.00, currency: 'GBP', fee: 0, net_amount: 950.00, description: 'Consulting fee', reference: 'REF-2026-010', sender_name: 'Manchester Consulting', sender_bank: 'HSBC', status: 'completed', provider_reference: 'PR-010', metadata: null, created_at: '2026-03-13T12:10:00Z', user_name: 'Kemi Adeyemi', user_email: 'kemi@outlook.com' },
  { id: 'txn_011', user_id: 'u_011', wallet_id: 'w_011', type: 'credit', amount: 8500.00, currency: 'EUR', fee: 0, net_amount: 8500.00, description: 'Multiple rapid transfers', reference: 'REF-2026-011', sender_name: 'Shell Company SA', sender_bank: 'Swiss National Bank', status: 'completed', provider_reference: 'PR-011', metadata: null, created_at: '2026-03-12T23:45:00Z', user_name: 'Tunde Bakare', user_email: 'tunde@gmail.com', flagged: true },
  { id: 'txn_012', user_id: 'u_012', wallet_id: 'w_012', type: 'credit', amount: 320.00, currency: 'USD', fee: 0, net_amount: 320.00, description: 'Upwork payment', reference: 'REF-2026-012', sender_name: 'Upwork Inc', sender_bank: 'Silicon Valley Bank', status: 'completed', provider_reference: 'PR-012', metadata: null, created_at: '2026-03-12T19:30:00Z', user_name: 'Grace Udo', user_email: 'grace@yahoo.com' },
  { id: 'txn_013', user_id: 'u_013', wallet_id: 'w_013', type: 'credit', amount: 1100.00, currency: 'USD', fee: 0, net_amount: 1100.00, description: 'Fiverr payout', reference: 'REF-2026-013', sender_name: 'Fiverr International', sender_bank: 'JPMorgan', status: 'completed', provider_reference: 'PR-013', metadata: null, created_at: '2026-03-12T15:00:00Z', user_name: 'Samuel Okonkwo', user_email: 'samuel@gmail.com' },
  { id: 'txn_014', user_id: 'u_014', wallet_id: 'w_014', type: 'debit', amount: 450.00, currency: 'EUR', fee: 6.75, net_amount: 443.25, description: 'USDT withdrawal', reference: 'REF-2026-014', sender_name: null, sender_bank: null, status: 'completed', provider_reference: 'PR-014', metadata: null, created_at: '2026-03-12T11:20:00Z', user_name: 'Blessing Nnamdi', user_email: 'blessing@hotmail.com' },
  { id: 'txn_015', user_id: 'u_015', wallet_id: 'w_015', type: 'credit', amount: 5600.00, currency: 'USD', fee: 0, net_amount: 5600.00, description: 'Project milestone', reference: 'REF-2026-015', sender_name: 'TechGiant Corp', sender_bank: 'Citi Bank', status: 'completed', provider_reference: 'PR-015', metadata: null, created_at: '2026-03-12T08:00:00Z', user_name: 'Yemi Alade', user_email: 'yemi@gmail.com' },
  { id: 'txn_016', user_id: 'u_001', wallet_id: 'w_001', type: 'debit', amount: 3000.00, currency: 'USD', fee: 45.00, net_amount: 2955.00, description: 'USDT withdrawal', reference: 'REF-2026-016', sender_name: null, sender_bank: null, status: 'failed', provider_reference: null, metadata: null, created_at: '2026-03-11T21:30:00Z', user_name: 'Adebayo Johnson', user_email: 'adebayo@gmail.com' },
  { id: 'txn_017', user_id: 'u_002', wallet_id: 'w_002', type: 'credit', amount: 2250.00, currency: 'GBP', fee: 0, net_amount: 2250.00, description: 'Salary payment', reference: 'REF-2026-017', sender_name: 'UK Employer Ltd', sender_bank: 'Lloyds Banking', status: 'completed', provider_reference: 'PR-017', metadata: null, created_at: '2026-03-11T17:15:00Z', user_name: 'Chioma Okafor', user_email: 'chioma@yahoo.com' },
  { id: 'txn_018', user_id: 'u_004', wallet_id: 'w_004', type: 'credit', amount: 12000.00, currency: 'EUR', fee: 0, net_amount: 12000.00, description: 'Suspicious rapid deposit', reference: 'REF-2026-018', sender_name: 'Anonymous Corp', sender_bank: 'Cayman Islands Bank', status: 'pending', provider_reference: null, metadata: null, created_at: '2026-03-11T14:00:00Z', user_name: 'Fatima Bello', user_email: 'fatima@gmail.com', flagged: true },
  { id: 'txn_019', user_id: 'u_006', wallet_id: 'w_006', type: 'credit', amount: 890.00, currency: 'USD', fee: 0, net_amount: 890.00, description: 'Freelance gig', reference: 'REF-2026-019', sender_name: 'Creative Agency Inc', sender_bank: 'PNC Bank', status: 'completed', provider_reference: 'PR-019', metadata: null, created_at: '2026-03-11T10:45:00Z', user_name: 'Ibrahim Musa', user_email: 'ibrahim@hotmail.com' },
  { id: 'txn_020', user_id: 'u_010', wallet_id: 'w_010', type: 'debit', amount: 700.00, currency: 'GBP', fee: 10.50, net_amount: 689.50, description: 'USDT withdrawal', reference: 'REF-2026-020', sender_name: null, sender_bank: null, status: 'completed', provider_reference: 'PR-020', metadata: null, created_at: '2026-03-11T07:30:00Z', user_name: 'Kemi Adeyemi', user_email: 'kemi@outlook.com' },
]

const summaryStats = {
  totalToday: 8450.50,
  totalThisWeek: 62560.00,
  averageSize: 3128.00,
  flaggedCount: 3,
}

const statusColors: Record<TransactionStatus, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export default function TransactionsPage() {
  const [search, setSearch] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTxn, setSelectedTxn] = useState<TransactionWithUser | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 10

  const filtered = mockTransactions.filter((txn) => {
    const matchesSearch =
      search === '' ||
      txn.user_name.toLowerCase().includes(search.toLowerCase()) ||
      txn.reference.toLowerCase().includes(search.toLowerCase()) ||
      txn.user_email.toLowerCase().includes(search.toLowerCase())
    const matchesCurrency = currencyFilter === 'all' || txn.currency === currencyFilter
    const matchesType = typeFilter === 'all' || txn.type === typeFilter
    const matchesStatus = statusFilter === 'all' || txn.status === statusFilter
    return matchesSearch && matchesCurrency && matchesType && matchesStatus
  })

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transaction Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor all transactions across the platform in real time.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Today</p>
                <p className="text-lg font-bold">{formatCurrency(summaryStats.totalToday)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total This Week</p>
                <p className="text-lg font-bold">{formatCurrency(summaryStats.totalThisWeek)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Average Size</p>
                <p className="text-lg font-bold">{formatCurrency(summaryStats.averageSize)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Flagged</p>
                <p className="text-lg font-bold">{summaryStats.flaggedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by user, email, or reference..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={currencyFilter} onValueChange={(v) => { setCurrencyFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as string); setPage(1) }}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Sender</TableHead>
                  <TableHead className="hidden lg:table-cell">Reference</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      No transactions found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((txn) => (
                    <TableRow
                      key={txn.id}
                      className={`cursor-pointer hover:bg-muted/50 ${txn.flagged ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                      onClick={() => setSelectedTxn(txn)}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {txn.flagged && <Flag className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span className="font-medium text-sm">{txn.user_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            txn.type === 'credit'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }
                        >
                          {txn.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(txn.amount, txn.currency)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">{txn.currency}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[txn.status]}>
                          {txn.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {txn.sender_name || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
                        {txn.reference}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); setSelectedTxn(txn) }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedTxn} onOpenChange={(open) => { if (!open) setSelectedTxn(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              Full details for this transaction.
            </DialogDescription>
          </DialogHeader>
          {selectedTxn && (
            <div className="space-y-5">
              {selectedTxn.flagged && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/10">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    This transaction has been flagged for review
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="font-mono font-medium">{selectedTxn.reference}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={statusColors[selectedTxn.status]}>
                    {selectedTxn.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p className="font-medium">{selectedTxn.user_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedTxn.user_email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <Badge
                    className={
                      selectedTxn.type === 'credit'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  >
                    {selectedTxn.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDateTime(selectedTxn.created_at)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(selectedTxn.amount, selectedTxn.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fee</p>
                  <p className="font-medium">
                    {formatCurrency(selectedTxn.fee, selectedTxn.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Net Amount</p>
                  <p className="font-medium">
                    {formatCurrency(selectedTxn.net_amount, selectedTxn.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Currency</p>
                  <p className="font-medium">{selectedTxn.currency}</p>
                </div>
              </div>

              {selectedTxn.sender_name && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Sender</p>
                      <p className="font-medium">{selectedTxn.sender_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sender Bank</p>
                      <p className="font-medium">{selectedTxn.sender_bank || '-'}</p>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="text-sm">
                <p className="text-muted-foreground">Description</p>
                <p className="font-medium">{selectedTxn.description}</p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {!selectedTxn.flagged && (
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Flag className="h-4 w-4 mr-1.5" />
                    Flag Transaction
                  </Button>
                )}
                <DialogClose
                  render={<Button variant="outline" size="sm">Close</Button>}
                />
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
