'use client'

/**
 * /admin/account-requests
 *
 * Queue of customer virtual-account applications, organised as three
 * side-by-side currency columns (USD / EUR / NGN) so reviewers don't
 * need to flip a dropdown to see what's pending per rail. If 200
 * customers apply at once, the column headers + counts show that
 * spread instantly and the cards inside each column give 1-click
 * triage.
 *
 * Provisioning: every approval here triggers Graph provisioning (we
 * dropped the Bridge rail; Graph is the only virtual-account
 * provider now) + an email to the customer from accounts@.
 *
 * Status filter still exists at the top so reviewers can flip
 * between PENDING / APPROVED / REJECTED queues — but currency is
 * handled visually rather than via a select.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, ChevronRight, Clock, FileText, Globe, Loader2, MapPin,
  RefreshCw, User as UserIcon, Wallet, XCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
    /** True if User.dob is set. False = Graph provisioning will fail
     *  with "Missing fields required by Graph: dob" until the admin
     *  backfills it via the inline DOB form. */
    hasDob: boolean
  }
}

const INFLOW_LABEL: Record<string, string> = {
  '50000': 'Up to $500/mo',
  '500000': '$500–$5k/mo',
  '1000000': '$5k–$10k/mo',
  '1000001': 'Above $10k/mo',
}

function fmtInflow(cents: string | null): string {
  if (!cents) return '—'
  return INFLOW_LABEL[cents] ?? `$${(parseInt(cents, 10) / 100).toLocaleString()}`
}

const CURRENCIES = [
  {
    code: 'USD' as const,
    label: 'US Dollar',
    flag: '🇺🇸',
    accent: 'border-emerald-200 dark:border-emerald-900',
    headerTone: 'bg-emerald-50/70 dark:bg-emerald-950/20',
    pillTone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    code: 'EUR' as const,
    label: 'Euro',
    flag: '🇪🇺',
    accent: 'border-sky-200 dark:border-sky-900',
    headerTone: 'bg-sky-50/70 dark:bg-sky-950/20',
    pillTone: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  {
    code: 'NGN' as const,
    label: 'Nigerian Naira',
    flag: '🇳🇬',
    accent: 'border-green-200 dark:border-green-900',
    headerTone: 'bg-green-50/70 dark:bg-green-950/20',
    pillTone: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  },
]

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
}

export default function AdminAccountRequestsPage() {
  const [rows, setRows] = useState<AccountRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const [selected, setSelected] = useState<AccountRequest | null>(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  // Inline DOB backfill — appears on the review modal when the
  // customer's User.dob is null. Without this, "Approve & provision"
  // returns "Missing fields required by Graph: dob" from upstream.
  const [dobInput, setDobInput] = useState('')
  const [dobSaving, setDobSaving] = useState(false)

  // Pull a generous page from the API (capped at 50 server-side) and
  // then split into columns client-side. For more than 50 we'd add
  // per-column pagination, but that's a future problem.
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: '50' })
      const res = await fetch(`/api/admin/account-requests?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = await res.json()
      setRows(json.requests)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { fetchList() }, [fetchList])

  // Group by currency once so each column gets a sorted slice.
  const byCurrency = useMemo(() => {
    const m: Record<'USD' | 'EUR' | 'NGN', AccountRequest[]> = { USD: [], EUR: [], NGN: [] }
    for (const r of rows) m[r.currency]?.push(r)
    // Newest first inside each column
    for (const k of Object.keys(m) as Array<'USD' | 'EUR' | 'NGN'>) {
      m[k].sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
    }
    return m
  }, [rows])

  function close() {
    setSelected(null)
    setShowRejectInput(false)
    setRejectionReason('')
    setDobInput('')
    setDobSaving(false)
  }

  async function saveDob() {
    if (!selected) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobInput)) {
      toast.error('Enter the date as YYYY-MM-DD.')
      return
    }
    setDobSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${selected.user.id}/dob`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dob: dobInput }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      toast.success('Date of birth saved — you can approve & provision now.')
      // Optimistically flip the local flag so the form disappears and
      // the Approve button enables without a full re-fetch.
      setSelected({ ...selected, user: { ...selected.user, hasDob: true } })
      // And refresh the list so the row reflects upstream.
      void fetchList()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save DOB')
    } finally {
      setDobSaving(false)
    }
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

  const totalForStatus = rows.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Virtual account requests</h1>
        <p className="text-muted-foreground text-sm">
          Customer applications for USD, EUR, and NGN virtual accounts.
        </p>
      </div>

      {/* Status switcher + refresh */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {loading ? 'Loading…' : `${totalForStatus} total`}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            <RefreshCw className={`size-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Three-column queue: USD, EUR, NGN */}
      <div className="grid gap-4 lg:grid-cols-3">
        {CURRENCIES.map((cur) => {
          const list = byCurrency[cur.code]
          return (
            <div key={cur.code} className={`rounded-2xl border ${cur.accent} bg-card flex flex-col min-h-[280px]`}>
              {/* Column header */}
              <div className={`flex items-center justify-between gap-2 rounded-t-2xl px-4 py-3 border-b ${cur.accent} ${cur.headerTone}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl leading-none">{cur.flag}</span>
                  <div>
                    <p className="font-semibold text-sm leading-tight">{cur.code}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{cur.label}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cur.pillTone}`}>
                  {list.length}
                </span>
              </div>

              {/* Card stack */}
              <div className="flex-1 p-3 space-y-2.5">
                {loading ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin mr-1.5" />Loading…
                  </div>
                ) : list.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    No {statusFilter.toLowerCase()} {cur.code} requests.
                  </div>
                ) : (
                  list.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="w-full text-left rounded-lg border bg-background p-3 hover:border-primary hover:shadow-sm transition-all"
                    >
                      {/* Top row: name + status pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                            {initials(r.user.displayName)}
                          </span>
                          <p className="font-medium text-sm truncate">{r.user.displayName}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[r.status]} className="shrink-0 text-[10px]">
                          {r.status}
                        </Badge>
                      </div>

                      {/* Email */}
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">{r.user.email}</p>

                      {/* Meta row: tier · country · inflow band */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono">{r.user.kycTier}</span>
                        {r.user.country && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/50 px-1.5 py-0.5">
                            <MapPin className="size-2.5" />
                            {r.user.country}
                          </span>
                        )}
                        {r.expectedMonthlyInflowCents && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/50 px-1.5 py-0.5">
                            <Wallet className="size-2.5" />
                            {fmtInflow(r.expectedMonthlyInflowCents)}
                          </span>
                        )}
                      </div>

                      {/* Purpose / source on a single dimmed line */}
                      {(r.purpose || r.sourceOfFunds) && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
                          {[r.purpose, r.sourceOfFunds].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      {/* Footer: submitted time + chevron */}
                      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{relativeTime(r.submittedAt)}</span>
                        <ChevronRight className="size-3" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Review dialog (unchanged) */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Review {selected.currency} application
                  <Badge variant="secondary">{selected.currency}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {selected.user.displayName} · {selected.user.email}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="KYC tier" value={selected.user.kycTier} icon={<UserIcon className="size-3" />} />
                  <Field label="Country" value={selected.user.country ?? '—'} icon={<Globe className="size-3" />} />
                  <Field label="Source of funds" value={selected.sourceOfFunds ?? '—'} />
                  <Field label="Purpose" value={selected.purpose ?? '—'} />
                  <Field label="Expected inflow" value={fmtInflow(selected.expectedMonthlyInflowCents)} icon={<Wallet className="size-3" />} />
                  <Field label="Submitted" value={new Date(selected.submittedAt).toLocaleString()} icon={<Clock className="size-3" />} />
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

                {/* Inline DOB backfill — Graph will reject provisioning
                    with "Missing fields required by Graph: dob" if the
                    customer's User.dob is null (i.e. they completed
                    KYC before DOB collection was added to the form).
                    Show this form so the admin can set it before
                    clicking Approve. */}
                {selected.status === 'PENDING' && !selected.user.hasDob && !showRejectInput && (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                      <p className="font-semibold mb-0.5">⚠ Date of birth missing</p>
                      <p className="opacity-90">
                        This customer completed KYC before DOB collection was added. Set it below before approving — Graph rejects USD provisioning without it.
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="admin-set-dob" className="text-xs font-medium">Date of birth</Label>
                        <Input
                          id="admin-set-dob"
                          type="date"
                          value={dobInput}
                          onChange={(e) => setDobInput(e.target.value)}
                          max={(() => {
                            const d = new Date()
                            d.setFullYear(d.getFullYear() - 18)
                            return d.toISOString().split('T')[0]
                          })()}
                          disabled={dobSaving}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveDob}
                        disabled={dobSaving || !dobInput}
                      >
                        {dobSaving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                        Save DOB
                      </Button>
                    </div>
                  </div>
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
                    <Button
                      onClick={() => act('approve')}
                      disabled={actionLoading || !selected.user.hasDob}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      title={!selected.user.hasDob ? 'Set the customer\'s date of birth above before approving.' : undefined}
                    >
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

// ── presentational helpers ──────────────────────────────────────────────────

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="mt-0.5 font-medium text-sm">{value}</p>
    </div>
  )
}

/** Build short initials for the avatar bubble. "Adebayo Okafor" → "AO" */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Cheap relative time without date-fns. Good enough for "5 min ago". */
function relativeTime(iso: string): string {
  const ms = Date.now() - +new Date(iso)
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
