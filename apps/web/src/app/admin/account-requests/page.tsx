'use client'

/**
 * /admin/account-requests
 *
 * Queue of customer virtual-account applications. Admin clicks a row,
 * reviews the customer + the step-2 wizard answers, then approves or
 * rejects. Approval calls /api/admin/account-requests/[id] PATCH which
 * runs the actual Bridge / Graph provisioning and emails the customer.
 *
 * Same shape as /admin/kyc — Status + Currency filters, paginated
 * table, click-through dialog with the approve/reject buttons.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AccountRequest {
  id: string
  currency: 'USD' | 'EUR' | 'NGN'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  sourceOfFunds: string | null
  purpose: string | null
  expectedMonthlyInflowCents: string | null
  submittedAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  externalAccountId: string | null
  user: {
    id: string
    email: string
    displayName: string
    kycTier: string
    country: string | null
  }
}

interface Pagination { page: number; limit: number; total: number; pages: number }

const PAGE_LIMIT = 20

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
}

const INFLOW_LABEL: Record<string, string> = {
  '50000': 'Up to $500 / mo',
  '500000': '$500–$5k / mo',
  '1000000': '$5k–$10k / mo',
  '1000001': 'Above $10k / mo',
}

function fmtInflow(cents: string | null): string {
  if (!cents) return '—'
  return INFLOW_LABEL[cents] ?? `$${(parseInt(cents, 10) / 100).toLocaleString()}`
}

export default function AdminAccountRequestsPage() {
  const [rows, setRows] = useState<AccountRequest[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [currencyFilter, setCurrencyFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<AccountRequest | null>(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
        status: statusFilter,
      })
      if (currencyFilter !== 'ALL') params.set('currency', currencyFilter)
      const res = await fetch(`/api/admin/account-requests?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = await res.json()
      setRows(json.requests)
      setPagination(json.pagination)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, currencyFilter])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { setPage(1) }, [statusFilter, currencyFilter])

  function close() {
    setSelected(null)
    setShowRejectInput(false)
    setRejectionReason('')
  }

  async function act(action: 'approve' | 'reject') {
    if (!selected) return
    if (action === 'reject' && rejectionReason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters.')
      return
    }
    setActionLoading(true)
    try {
      const body: Record<string, string> = { action }
      if (action === 'reject') body.rejectionReason = rejectionReason.trim()
      const res = await fetch(`/api/admin/account-requests/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Action failed (${res.status})`)
      toast.success(action === 'approve' ? 'Approved + provisioned' : 'Rejected')
      close()
      fetchList()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Virtual account requests</h1>
        <p className="text-muted-foreground text-sm">
          Customer applications for USD, EUR, and NGN virtual accounts. Approval triggers Bridge / Graph provisioning + emails the customer from accounts@.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="NGN">NGN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Inflow band</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin mr-2" />Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No requests for this filter.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(r)}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{r.user.displayName}</span>
                      <span className="text-xs text-muted-foreground">{r.user.email} · {r.user.kycTier}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{r.currency}</Badge></TableCell>
                  <TableCell className="text-sm">{r.purpose ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.sourceOfFunds ?? '—'}</TableCell>
                  <TableCell className="text-sm">{fmtInflow(r.expectedMonthlyInflowCents)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.submittedAt).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost">Review</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.pages} · {pagination.total} total
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages || loading} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Review {selected.currency} application</DialogTitle>
                <DialogDescription>
                  {selected.user.displayName} · {selected.user.email}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">KYC tier</p>
                    <p className="font-medium">{selected.user.kycTier}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="font-medium">{selected.user.country ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Source of funds</p>
                    <p className="font-medium">{selected.sourceOfFunds ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Purpose</p>
                    <p className="font-medium">{selected.purpose ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected inflow</p>
                    <p className="font-medium">{fmtInflow(selected.expectedMonthlyInflowCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="font-medium">{new Date(selected.submittedAt).toLocaleString()}</p>
                  </div>
                </div>

                {selected.status === 'APPROVED' && selected.externalAccountId && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Approved on {new Date(selected.reviewedAt!).toLocaleString()} · Account id: <span className="font-mono">{selected.externalAccountId}</span>
                    </AlertDescription>
                  </Alert>
                )}

                {selected.status === 'REJECTED' && selected.rejectionReason && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <span className="font-medium">Reason: </span>{selected.rejectionReason}
                    </AlertDescription>
                  </Alert>
                )}

                {selected.status === 'PENDING' && showRejectInput && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-destructive">
                      Rejection reason <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      disabled={actionLoading}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      The exact wording the customer reads in the rejection email.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row">
                <Button variant="ghost" onClick={close} disabled={actionLoading}>Close</Button>
                {selected.status === 'PENDING' && !showRejectInput && (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectInput(true)}>
                      <XCircle className="size-4 mr-1.5" />Reject
                    </Button>
                    <Button onClick={() => act('approve')} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {actionLoading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="size-4 mr-1.5" />}
                      Approve & provision
                    </Button>
                  </>
                )}
                {selected.status === 'PENDING' && showRejectInput && (
                  <>
                    <Button variant="outline" onClick={() => { setShowRejectInput(false); setRejectionReason('') }} disabled={actionLoading}>Cancel</Button>
                    <Button variant="destructive" onClick={() => act('reject')} disabled={actionLoading || rejectionReason.trim().length < 10}>
                      {actionLoading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <XCircle className="size-4 mr-1.5" />}
                      Confirm rejection
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
