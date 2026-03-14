'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Check,
  X,
  Eye,
  ExternalLink,
} from 'lucide-react'
import { formatCurrency, formatDateTime, truncateAddress } from '@/lib/utils'
import type { WithdrawalStatus } from '@/types'

interface WithdrawalWithUser {
  id: string
  user_id: string
  wallet_id: string
  amount: number
  currency: string
  fee: number
  usdt_amount: number
  usdt_rate: number
  wallet_address: string
  network: 'trc20' | 'erc20'
  tx_hash: string | null
  status: WithdrawalStatus
  reviewed_by: string | null
  created_at: string
  completed_at: string | null
  user_name: string
  user_email: string
}

const mockWithdrawals: WithdrawalWithUser[] = [
  { id: 'wd_001', user_id: 'u_003', wallet_id: 'w_003', amount: 500.00, currency: 'USD', fee: 7.50, usdt_amount: 492.50, usdt_rate: 1.0, wallet_address: 'TXqR5bNhPLoMnZ2R6kzfPqY2bXJGvzp5Mv', network: 'trc20', tx_hash: null, status: 'pending', reviewed_by: null, created_at: '2026-03-14T08:12:00Z', completed_at: null, user_name: 'Emeka Nwosu', user_email: 'emeka@outlook.com' },
  { id: 'wd_002', user_id: 'u_009', wallet_id: 'w_009', amount: 2000.00, currency: 'USD', fee: 30.00, usdt_amount: 1970.00, usdt_rate: 1.0, wallet_address: 'TN3W4H6BYLkFfDzGFeMHbZTkYoAoM4M3gD', network: 'trc20', tx_hash: null, status: 'pending', reviewed_by: null, created_at: '2026-03-13T14:55:00Z', completed_at: null, user_name: 'Aisha Yusuf', user_email: 'aisha@gmail.com' },
  { id: 'wd_003', user_id: 'u_001', wallet_id: 'w_001', amount: 3000.00, currency: 'USD', fee: 45.00, usdt_amount: 2955.00, usdt_rate: 1.0, wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', network: 'erc20', tx_hash: null, status: 'pending', reviewed_by: null, created_at: '2026-03-13T10:00:00Z', completed_at: null, user_name: 'Adebayo Johnson', user_email: 'adebayo@gmail.com' },
  { id: 'wd_004', user_id: 'u_004', wallet_id: 'w_004', amount: 1500.00, currency: 'EUR', fee: 22.50, usdt_amount: 1610.18, usdt_rate: 1.09, wallet_address: 'TPYmHEktyF3Fc2WMVhCJJEBt7JGJmX4YSe', network: 'trc20', tx_hash: null, status: 'processing', reviewed_by: 'u_007', created_at: '2026-03-12T16:30:00Z', completed_at: null, user_name: 'Fatima Bello', user_email: 'fatima@gmail.com' },
  { id: 'wd_005', user_id: 'u_010', wallet_id: 'w_010', amount: 700.00, currency: 'GBP', fee: 10.50, usdt_amount: 876.73, usdt_rate: 1.27, wallet_address: 'TJYs1p5nvHFBHVXo5bWfKqRjJxRnq7fXPv', network: 'trc20', tx_hash: null, status: 'processing', reviewed_by: 'u_016', created_at: '2026-03-12T09:20:00Z', completed_at: null, user_name: 'Kemi Adeyemi', user_email: 'kemi@outlook.com' },
  { id: 'wd_006', user_id: 'u_006', wallet_id: 'w_006', amount: 1200.00, currency: 'GBP', fee: 18.00, usdt_amount: 1500.12, usdt_rate: 1.27, wallet_address: 'TVJjk3kUhdN6nqc2BSPFY8dLz1FGqd5V6P', network: 'trc20', tx_hash: '5a7b3c9d8e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b', status: 'completed', reviewed_by: 'u_007', created_at: '2026-03-11T14:00:00Z', completed_at: '2026-03-11T15:30:00Z', user_name: 'Ibrahim Musa', user_email: 'ibrahim@hotmail.com' },
  { id: 'wd_007', user_id: 'u_014', wallet_id: 'w_014', amount: 450.00, currency: 'EUR', fee: 6.75, usdt_amount: 483.44, usdt_rate: 1.09, wallet_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', network: 'erc20', tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', status: 'completed', reviewed_by: 'u_016', created_at: '2026-03-11T08:45:00Z', completed_at: '2026-03-11T10:00:00Z', user_name: 'Blessing Nnamdi', user_email: 'blessing@hotmail.com' },
  { id: 'wd_008', user_id: 'u_015', wallet_id: 'w_015', amount: 800.00, currency: 'USD', fee: 12.00, usdt_amount: 788.00, usdt_rate: 1.0, wallet_address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', network: 'trc20', tx_hash: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123', status: 'completed', reviewed_by: 'u_007', created_at: '2026-03-10T17:20:00Z', completed_at: '2026-03-10T18:45:00Z', user_name: 'Yemi Alade', user_email: 'yemi@gmail.com' },
  { id: 'wd_009', user_id: 'u_001', wallet_id: 'w_001', amount: 3000.00, currency: 'USD', fee: 45.00, usdt_amount: 2955.00, usdt_rate: 1.0, wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', network: 'erc20', tx_hash: null, status: 'failed', reviewed_by: 'u_007', created_at: '2026-03-10T12:00:00Z', completed_at: null, user_name: 'Adebayo Johnson', user_email: 'adebayo@gmail.com' },
  { id: 'wd_010', user_id: 'u_012', wallet_id: 'w_012', amount: 250.00, currency: 'USD', fee: 3.75, usdt_amount: 246.25, usdt_rate: 1.0, wallet_address: 'TBadAddressInvalidWalletXXXXXXXXXXXXX', network: 'trc20', tx_hash: null, status: 'failed', reviewed_by: 'u_016', created_at: '2026-03-09T20:30:00Z', completed_at: null, user_name: 'Grace Udo', user_email: 'grace@yahoo.com' },
  { id: 'wd_011', user_id: 'u_002', wallet_id: 'w_002', amount: 5000.00, currency: 'GBP', fee: 75.00, usdt_amount: 6250.00, usdt_rate: 1.27, wallet_address: 'TMuA6YqfCeX8EhbfYEbq4Fk44nEbYqKgNR', network: 'trc20', tx_hash: null, status: 'pending', reviewed_by: null, created_at: '2026-03-14T11:00:00Z', completed_at: null, user_name: 'Chioma Okafor', user_email: 'chioma@yahoo.com' },
]

const statusColors: Record<WithdrawalStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export default function WithdrawalsPage() {
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalWithUser | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [txHashInput, setTxHashInput] = useState('')
  const [showTxHashForm, setShowTxHashForm] = useState(false)

  const pending = mockWithdrawals.filter((w) => w.status === 'pending')
  const processing = mockWithdrawals.filter((w) => w.status === 'processing')
  const completed = mockWithdrawals.filter((w) => w.status === 'completed')
  const failed = mockWithdrawals.filter((w) => w.status === 'failed')

  function WithdrawalTable({ records }: { records: WithdrawalWithUser[] }) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="hidden md:table-cell">USDT</TableHead>
              <TableHead className="hidden md:table-cell">Network</TableHead>
              <TableHead className="hidden lg:table-cell">Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No withdrawals in this category.
                </TableCell>
              </TableRow>
            ) : (
              records.map((wd) => (
                <TableRow key={wd.id} className="hover:bg-muted/50">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(wd.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{wd.user_name}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(wd.amount, wd.currency)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-sm">
                    {wd.usdt_amount.toFixed(2)} USDT
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {wd.network}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                    {truncateAddress(wd.wallet_address)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[wd.status]}>{wd.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedWithdrawal(wd)
                        setShowRejectForm(false)
                        setShowTxHashForm(false)
                        setRejectReason('')
                        setTxHashInput('')
                      }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Withdrawal Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review, approve, and track USDT withdrawal requests.
        </p>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="pending">
            <div className="border-b px-4 pt-3">
              <TabsList variant="line">
                <TabsTrigger value="pending">
                  Pending Review
                  {pending.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
                      {pending.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="processing">
                  Processing
                  <span className="ml-1.5 text-xs text-muted-foreground">({processing.length})</span>
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed
                  <span className="ml-1.5 text-xs text-muted-foreground">({completed.length})</span>
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed
                  <span className="ml-1.5 text-xs text-muted-foreground">({failed.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="pending">
              <WithdrawalTable records={pending} />
            </TabsContent>
            <TabsContent value="processing">
              <WithdrawalTable records={processing} />
            </TabsContent>
            <TabsContent value="completed">
              <WithdrawalTable records={completed} />
            </TabsContent>
            <TabsContent value="failed">
              <WithdrawalTable records={failed} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Withdrawal Detail Dialog */}
      <Dialog
        open={!!selectedWithdrawal}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedWithdrawal(null)
            setShowRejectForm(false)
            setShowTxHashForm(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdrawal Details</DialogTitle>
            <DialogDescription>
              Review the withdrawal request details.
            </DialogDescription>
          </DialogHeader>
          {selectedWithdrawal && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p className="font-medium">{selectedWithdrawal.user_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedWithdrawal.user_email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={statusColors[selectedWithdrawal.status]}>
                    {selectedWithdrawal.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDateTime(selectedWithdrawal.created_at)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Withdrawal Amount</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(selectedWithdrawal.amount, selectedWithdrawal.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fee</p>
                  <p className="font-medium">
                    {formatCurrency(selectedWithdrawal.fee, selectedWithdrawal.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">USDT Amount</p>
                  <p className="text-lg font-bold font-mono">
                    {selectedWithdrawal.usdt_amount.toFixed(2)} USDT
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">USDT Rate</p>
                  <p className="font-medium">
                    1 {selectedWithdrawal.currency} = {selectedWithdrawal.usdt_rate.toFixed(4)} USDT
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Network</p>
                  <Badge variant="outline" className="uppercase mt-1">
                    {selectedWithdrawal.network}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Wallet Address</p>
                  <p className="font-mono text-xs break-all bg-muted rounded p-2 mt-1">
                    {selectedWithdrawal.wallet_address}
                  </p>
                </div>
                {selectedWithdrawal.tx_hash && (
                  <div>
                    <p className="text-muted-foreground">Transaction Hash</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-mono text-xs break-all bg-muted rounded p-2 flex-1">
                        {selectedWithdrawal.tx_hash}
                      </p>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions based on status */}
              {selectedWithdrawal.status === 'pending' && !showRejectForm && (
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white flex-1"
                    onClick={() => setSelectedWithdrawal(null)}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setShowRejectForm(true)}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Reject
                  </Button>
                </DialogFooter>
              )}

              {selectedWithdrawal.status === 'pending' && showRejectForm && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-red-600">
                    Rejection Reason
                  </Label>
                  <Textarea
                    placeholder="Explain why this withdrawal is being rejected..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={rejectReason.trim().length === 0}
                      onClick={() => setSelectedWithdrawal(null)}
                    >
                      Confirm Rejection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRejectForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {selectedWithdrawal.status === 'processing' && !showTxHashForm && (
                <DialogFooter>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setShowTxHashForm(true)}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Mark Complete
                  </Button>
                </DialogFooter>
              )}

              {selectedWithdrawal.status === 'processing' && showTxHashForm && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Transaction Hash
                  </Label>
                  <Input
                    placeholder="Enter the blockchain transaction hash..."
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      disabled={txHashInput.trim().length === 0}
                      onClick={() => setSelectedWithdrawal(null)}
                    >
                      Confirm Completion
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTxHashForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {(selectedWithdrawal.status === 'completed' || selectedWithdrawal.status === 'failed') && (
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="outline" className="w-full">
                        Close
                      </Button>
                    }
                  />
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
