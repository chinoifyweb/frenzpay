'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime, cn } from '@/lib/utils'
import { REJECTION_TEMPLATES } from '@/lib/kyc-rejection-templates'

// ─── Types ──────────────────────────────────────────────────────────────────

type KYCSubmissionStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED'
type KYCTier = 'T1' | 'T2' | 'T3'

interface KYCDocument {
  id: string
  docType: string
  mimeType: string
  fileSizeBytes: string   // BigInt serialised as string
  createdAt: string
}

interface KYCUser {
  id: string
  email: string
  firstName: string
  lastName: string
  kycTier: string
  kycStatus: string
}

interface KYCSubmission {
  id: string
  tier: KYCTier
  status: KYCSubmissionStatus
  provider: string | null
  submittedAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  /** Decrypted server-side — as printed on the ID */
  fullLegalName: string | null
  /** Decrypted server-side — one of NIN / passport / driver's number */
  docNumber: string | null
  docKind: 'nin' | 'passport' | 'drivers_license' | 'voters_card' | null
  purposeOfAccount: string | null
  sourceOfFunds: string | null
  /** 'recorded' = captured live by the in-browser recorder.
   *  'uploaded' = the customer hit the fallback and uploaded a clip from
   *  their gallery (camera blocked / not available). Reviewers should
   *  treat uploads with extra scrutiny. */
  livenessSource: 'recorded' | 'uploaded' | null
  user: KYCUser
  documents: KYCDocument[]
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

interface KYCListResponse {
  submissions: KYCSubmission[]
  pagination: Pagination
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<KYCSubmissionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const TIER_COLORS: Record<KYCTier, string> = {
  T1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  T2: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  T3: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

const PAGE_LIMIT = 20

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | string): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes
  if (!n) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const DOC_KIND_LABEL: Record<NonNullable<KYCSubmission['docKind']>, string> = {
  nin: 'NIN',
  passport: 'International Passport',
  drivers_license: 'Driver’s License',
  voters_card: 'Voter’s Card (PVC)',
}

const PURPOSE_LABEL: Record<string, string> = {
  personal: 'Personal use',
  business: 'Business / company',
  freelance: 'Freelance / contractor income',
  ecommerce: 'E-commerce / online sales',
  investment: 'Investment / trading',
  remittance: 'Remittance / family support',
  other: 'Other',
}

const SOURCE_LABEL: Record<string, string> = {
  salary: 'Salary / employment',
  business: 'Business revenue',
  freelance: 'Freelance / contract work',
  investments: 'Investments / dividends',
  savings: 'Personal savings',
  gift: 'Gift / family support',
  other: 'Other',
}

const DOC_TYPE_LABEL: Record<string, string> = {
  id_front: 'ID — front',
  id_back: 'ID — back',
  selfie: 'Selfie',
  liveness: 'Liveness',
  proof_of_address: 'Proof of address',
}

function getUserFullName(user: KYCUser): string {
  return `${user.firstName} ${user.lastName}`.trim()
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KYCPage() {
  const [submissions, setSubmissions] = useState<KYCSubmission[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    pages: 1,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [tierFilter, setTierFilter] = useState<string>('ALL')
  const [page, setPage] = useState(1)

  const [selectedSubmission, setSelectedSubmission] = useState<KYCSubmission | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionReasonCode, setRejectionReasonCode] = useState<string>('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (tierFilter !== 'ALL') params.set('tier', tierFilter)

      const res = await fetch(`/api/admin/kyc?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? `Request failed with status ${res.status}`)
      }
      const data: KYCListResponse = await res.json()
      setSubmissions(data.submissions)
      setPagination(data.pagination)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load KYC submissions.'
      setFetchError(message)
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter, tierFilter])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, tierFilter])

  function openReview(submission: KYCSubmission) {
    setSelectedSubmission(submission)
    setShowRejectInput(false)
    setRejectionReason('')
    setRejectionReasonCode('')
  }

  function closeReview() {
    setSelectedSubmission(null)
    setShowRejectInput(false)
    setRejectionReason('')
    setRejectionReasonCode('')
  }

  async function handleAction(action: 'approve' | 'reject') {
    if (!selectedSubmission) return
    if (action === 'reject' && rejectionReason.trim().length === 0) {
      toast.error('Please provide a rejection reason.')
      return
    }

    setIsSubmitting(true)
    try {
      const body: { action: string; rejectionReason?: string; rejectionReasonCode?: string } = { action }
      if (action === 'reject') {
        body.rejectionReason = rejectionReason.trim()
        if (rejectionReasonCode) body.rejectionReasonCode = rejectionReasonCode
      }

      const res = await fetch(`/api/admin/kyc/${selectedSubmission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.message ?? `Request failed with status ${res.status}`)
      }

      toast.success(
        action === 'approve'
          ? 'Submission approved successfully.'
          : 'Submission rejected successfully.'
      )
      closeReview()
      fetchSubmissions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPending = selectedSubmission?.status === 'PENDING' || selectedSubmission?.status === 'PROCESSING'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">KYC Review Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pending submissions show by default. Use the tabs below to view approved or rejected ones.
        </p>
      </div>

      {/* Quick-filter tabs — single click to switch between Pending /
          Approved / Rejected / All. The dropdown filter underneath
          stays for finer combos (status × tier). Reviewers were missing
          approved submissions because the dropdown defaulted to PENDING
          and there was no obvious affordance to change it. */}
      <div className="flex items-center gap-1 border-b">
        {(
          [
            { value: 'PENDING', label: 'Pending' },
            { value: 'PROCESSING', label: 'Processing' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'ALL', label: 'All' },
          ] as const
        ).map((tab) => {
          const active = statusFilter === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={statusFilter}
                onValueChange={(v) => { if (v) setStatusFilter(v); }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status">
                    {(v: unknown) => {
                      const labels: Record<string, string> = {
                        ALL: 'All Statuses',
                        PENDING: 'Pending',
                        PROCESSING: 'Processing',
                        APPROVED: 'Approved',
                        REJECTED: 'Rejected',
                      }
                      return labels[String(v)] ?? null
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={tierFilter}
                onValueChange={(v) => { if (v) setTierFilter(v); }}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Tier">
                    {(v: unknown) => v === 'ALL' ? 'All Tiers' : v === 'T1' || v === 'T2' || v === 'T3' ? String(v) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Tiers</SelectItem>
                  <SelectItem value="T1">T1</SelectItem>
                  <SelectItem value="T2">T2</SelectItem>
                  <SelectItem value="T3">T3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isLoading && (
              <p className="text-sm text-muted-foreground sm:ml-auto">
                {pagination.total} submission{pagination.total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {fetchError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{fetchError}</AlertDescription>
              </Alert>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchSubmissions}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Provider</TableHead>
                    <TableHead className="hidden md:table-cell">Submitted</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : submissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                        No submissions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions.map((submission) => (
                      <TableRow key={submission.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm leading-tight">
                              {getUserFullName(submission.user)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {submission.user.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={TIER_COLORS[submission.tier]}>
                            {submission.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[submission.status]}>
                            {submission.status.charAt(0) + submission.status.slice(1).toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {submission.provider ?? '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(submission.submittedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            {submission.documents.length}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReview(submission)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && !fetchError && pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages} &mdash; {pagination.total} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 1 || isLoading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  {page} / {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= pagination.pages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={(open) => { if (!open) closeReview() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KYC Submission Review</DialogTitle>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-5">
              {/* User Info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  User Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Full Name</p>
                    <p className="font-medium">{getUserFullName(selectedSubmission.user)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium break-all">{selectedSubmission.user.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Account KYC Tier</p>
                    <p className="font-medium">{selectedSubmission.user.kycTier}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Account KYC Status</p>
                    <p className="font-medium capitalize">{selectedSubmission.user.kycStatus.toLowerCase()}</p>
                  </div>
                </div>
              </div>

              {/* Submission Meta */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Submission Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Tier Requested</p>
                    <Badge className={TIER_COLORS[selectedSubmission.tier]}>
                      {selectedSubmission.tier}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Status</p>
                    <Badge className={STATUS_COLORS[selectedSubmission.status]}>
                      {selectedSubmission.status.charAt(0) + selectedSubmission.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Provider</p>
                    <p className="font-medium">{selectedSubmission.provider ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Submitted</p>
                    <p className="font-medium">{formatDateTime(selectedSubmission.submittedAt)}</p>
                  </div>
                  {selectedSubmission.reviewedAt && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Reviewed</p>
                      <p className="font-medium">{formatDateTime(selectedSubmission.reviewedAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Identity claim — decrypted server-side for admin eyes only */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Identity claim
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Full legal name (as printed on ID)</p>
                    <p className="font-medium">{selectedSubmission.fullLegalName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">ID type</p>
                    <p className="font-medium">
                      {selectedSubmission.docKind ? DOC_KIND_LABEL[selectedSubmission.docKind] : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Document number</p>
                    <p className="font-mono text-sm">{selectedSubmission.docNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Purpose of account</p>
                    <p className="font-medium">
                      {selectedSubmission.purposeOfAccount
                        ? (PURPOSE_LABEL[selectedSubmission.purposeOfAccount] ?? selectedSubmission.purposeOfAccount)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Source of funds</p>
                    <p className="font-medium">
                      {selectedSubmission.sourceOfFunds
                        ? (SOURCE_LABEL[selectedSubmission.sourceOfFunds] ?? selectedSubmission.sourceOfFunds)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Documents — each opens in a new tab, streamed decrypted */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Documents ({selectedSubmission.documents.length})
                  </h3>
                </div>
                {/* Reviewer reminder — liveness is upload-only now (we
                    removed the in-browser recorder). Every clip is the
                    customer's own recording, so the reviewer is the only
                    line of defence against a deepfake / replayed video.
                    The yellow nudge keeps that top of mind on every
                    review. */}
                {selectedSubmission.documents.some((d) => d.docType === 'liveness') && (
                  <div className="rounded-md border border-amber-300/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                    <p className="font-medium mb-0.5">⚠ Liveness review checklist</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-1 opacity-90">
                      <li>Face in the video matches the selfie AND the photo on the ID.</li>
                      <li>Customer says their full name + a current date out loud.</li>
                      <li>Head turns left / right / up — not a static image with audio.</li>
                      <li>Lighting + background look natural; no obvious looping or stitching.</li>
                    </ul>
                  </div>
                )}
                {selectedSubmission.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No documents attached.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedSubmission.documents.map((doc) => {
                      const label = DOC_TYPE_LABEL[doc.docType] ?? doc.docType
                      const isImage = doc.mimeType.startsWith('image/')
                      const isVideo = doc.mimeType.startsWith('video/')
                      const src = `/api/admin/kyc/document/${doc.id}`
                      const isLiveness = doc.docType === 'liveness'
                      const livenessSource = isLiveness ? selectedSubmission.livenessSource : null
                      return (
                        <div key={doc.id} className="overflow-hidden rounded-lg border bg-muted/20">
                          <div className="aspect-video bg-black/5 dark:bg-black/20 flex items-center justify-center relative">
                            {isImage && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
                            )}
                            {isVideo && (
                              <video src={src} controls playsInline className="max-h-full max-w-full" />
                            )}
                            {!isImage && !isVideo && (
                              <FileText className="h-8 w-8 text-muted-foreground" />
                            )}
                            {isLiveness && livenessSource && (
                              <span
                                className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow ${
                                  livenessSource === 'uploaded'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-emerald-600 text-white'
                                }`}
                                title={
                                  livenessSource === 'uploaded'
                                    ? 'Customer uploaded this clip from their device — review extra carefully.'
                                    : 'Captured live by the in-browser recorder.'
                                }
                              >
                                {livenessSource === 'uploaded' ? 'Uploaded' : 'Live'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {label}
                                {isLiveness && livenessSource === 'uploaded' && (
                                  <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">(uploaded)</span>
                                )}
                              </p>
                              <p className="truncate text-muted-foreground">
                                {doc.mimeType} &middot; {formatBytes(doc.fileSizeBytes)}
                              </p>
                            </div>
                            <a
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md border px-2 py-1 hover:bg-muted"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Existing rejection reason (read-only) */}
              {selectedSubmission.status === 'REJECTED' && selectedSubmission.rejectionReason && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <span className="font-medium">Rejection reason: </span>
                    {selectedSubmission.rejectionReason}
                  </AlertDescription>
                </Alert>
              )}

              {/* Rejection input (toggled) */}
              {isPending && showRejectInput && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Reason category</Label>
                    <Select
                      value={rejectionReasonCode}
                      onValueChange={(v) => {
                        setRejectionReasonCode(v)
                        // Picking a template prefills the customer-facing
                        // message; admin can still tweak before submit.
                        // OTHER clears it so the admin writes from scratch.
                        const tpl = REJECTION_TEMPLATES.find((t) => t.code === v)
                        if (tpl && tpl.code !== 'OTHER') setRejectionReason(tpl.customerMessage)
                        else if (tpl?.code === 'OTHER') setRejectionReason('')
                      }}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {REJECTION_TEMPLATES.map((t) => (
                          <SelectItem key={t.code} value={t.code}>{t.adminLabel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Picking a category prefills the message and emails the customer a step-by-step &quot;what to do&quot; checklist.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rejection-reason" className="text-sm font-medium">
                      Customer-facing message <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={4}
                      disabled={isSubmitting}
                      className="resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Action Footer */}
              <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
                {isPending ? (
                  showRejectInput ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => {
                          setShowRejectInput(false)
                          setRejectionReason('')
                        }}
                        className="sm:order-first"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isSubmitting || rejectionReason.trim().length === 0}
                        onClick={() => handleAction('reject')}
                        className="flex-1 sm:flex-none"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-1.5" />
                        )}
                        Confirm Rejection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => setShowRejectInput(true)}
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 flex-1 sm:flex-none"
                      >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleAction('approve')}
                        className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        )}
                        Approve
                      </Button>
                    </>
                  )
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={closeReview}
                    className="w-full sm:w-auto"
                  >
                    Close
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
