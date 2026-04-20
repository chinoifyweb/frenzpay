'use client'

/**
 * /dashboard/kyc — Internal KYC submission.
 *
 * Single-step review (no Dojah auto-check):
 *   1. Customer picks ID type (NIN / Driver's License / International Passport)
 *   2. Enters doc number + full legal name as printed on the ID
 *   3. Picks purpose of account + source of funds
 *   4. Uploads ID front (+ back for Driver's License), selfie, liveness proof
 *      (short video OR a fresh photo taken now)
 *   5. Clicks Submit; status = PENDING_REVIEW, admin reviews within 24h
 *
 * States shown:
 *   - NOT_STARTED: show the form
 *   - PENDING_REVIEW: show "under review" with the SLA
 *   - REJECTED: show the reason + a "Submit again" button that reopens the form
 *   - APPROVED: show "verified" + link to /dashboard/wallet to activate a
 *     currency rail
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileImage,
  Loader2,
  Shield,
  ShieldCheck,
  Upload,
  Video,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useMe } from '@/hooks/use-me'

// ── Field option lists (must match server-side enums in /api/kyc/t2) ────────

const ID_TYPES = [
  { value: 'nin', label: 'National Identity Number (NIN)', helper: '11-digit NIN on your slip or card', requiresBack: false },
  { value: 'drivers_license', label: 'Driver\u2019s License', helper: 'Front AND back required', requiresBack: true },
  { value: 'passport', label: 'International Passport', helper: 'Photo page', requiresBack: false },
] as const
type IdType = (typeof ID_TYPES)[number]['value']

const PURPOSES = [
  { value: 'personal', label: 'Personal use' },
  { value: 'business', label: 'Business / company' },
  { value: 'freelance', label: 'Freelance / contractor income' },
  { value: 'ecommerce', label: 'E-commerce / online sales' },
  { value: 'investment', label: 'Investment / trading' },
  { value: 'remittance', label: 'Remittance / sending to family' },
  { value: 'other', label: 'Other' },
] as const

const SOURCES = [
  { value: 'salary', label: 'Salary / employment' },
  { value: 'business', label: 'Business revenue' },
  { value: 'freelance', label: 'Freelance / contract work' },
  { value: 'investments', label: 'Investments / dividends' },
  { value: 'savings', label: 'Personal savings' },
  { value: 'gift', label: 'Gift / family support' },
  { value: 'other', label: 'Other' },
] as const

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const VIDEO_OR_IMAGE_TYPES = [...IMAGE_TYPES, 'video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_LIVENESS_BYTES = 25 * 1024 * 1024

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// ── Page ───────────────────────────────────────────────────────────────────

type KycState = 'loading' | 'not_started' | 'pending' | 'approved' | 'rejected'

export default function KycPage() {
  const { me, loading: meLoading, refresh } = useMe()

  const [state, setState] = useState<KycState>('loading')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (meLoading) { setState('loading'); return }
    if (!me) { setState('loading'); return }
    const tier = me.kycTier
    const status = me.kycStatus
    if (tier === 'T2' || tier === 'T3') {
      setState('approved')
    } else if (status === 'PENDING_REVIEW') {
      setState('pending')
    } else if (status === 'REJECTED') {
      setState('rejected')
      fetch('/api/kyc', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.pendingSubmission?.rejectionReason) {
            setRejectionReason(d.pendingSubmission.rejectionReason)
          }
        }).catch(() => { /* silent */ })
    } else {
      setState('not_started')
    }
  }, [me, meLoading])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Identity verification</h1>
        <p className="text-sm text-muted-foreground">
          We verify every account to keep FrenzPay safe and compliant. Usually takes under 24 hours.
        </p>
      </div>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'approved' && <ApprovedCard />}
      {state === 'pending' && <PendingCard />}
      {state === 'rejected' && !showForm && (
        <RejectedCard reason={rejectionReason} onResubmit={() => setShowForm(true)} />
      )}

      {(state === 'not_started' || (state === 'rejected' && showForm)) && (
        <KycForm
          onSubmitted={() => {
            toast.success('Submitted \u2014 we\u2019ll email you within 24 hours.')
            setShowForm(false)
            void refresh()
            setState('pending')
          }}
        />
      )}
    </div>
  )
}

// ── State cards ────────────────────────────────────────────────────────────

function ApprovedCard() {
  return (
    <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-lg font-semibold">Identity verified</h2>
          <p className="text-sm text-muted-foreground">
            You\u2019re all set. Head to your wallet to activate a USD or EUR account and start receiving payments.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Verified
        </Badge>
        <Button asChild>
          <Link href="/dashboard/wallet">Go to wallet</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function PendingCard() {
  return (
    <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20 text-sky-600">
          <Clock className="h-7 w-7" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-lg font-semibold">Under review</h2>
          <p className="text-sm text-muted-foreground">
            We\u2019ve got your documents. Our team reviews every submission manually \u2014 you\u2019ll hear back by email within 24 hours.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Clock className="h-3 w-3" />
          Pending review
        </Badge>
      </CardContent>
    </Card>
  )
}

function RejectedCard({ reason, onResubmit }: { reason: string | null; onResubmit: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-lg font-semibold">Verification declined</h2>
          {reason && (
            <p className="rounded-md border border-red-300 bg-background px-3 py-2 text-left text-sm">
              <span className="font-medium">Reason:</span> {reason}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            You can submit again with fresh documents. Make sure images are sharp, all corners of the ID are visible, and the selfie matches the photo on the ID.
          </p>
        </div>
        <Button onClick={onResubmit}>Submit again</Button>
      </CardContent>
    </Card>
  )
}

// ── Form ───────────────────────────────────────────────────────────────────

function KycForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [docType, setDocType] = useState<IdType>('nin')
  const [docNumber, setDocNumber] = useState('')
  const [fullLegalName, setFullLegalName] = useState('')
  const [purposeOfAccount, setPurposeOfAccount] = useState('')
  const [sourceOfFunds, setSourceOfFunds] = useState('')

  const [idFront, setIdFront] = useState<File | null>(null)
  const [idBack, setIdBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [liveness, setLiveness] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresBack = ID_TYPES.find(t => t.value === docType)?.requiresBack ?? false

  const canSubmit =
    docNumber.trim().length >= 5 &&
    fullLegalName.trim().length >= 4 &&
    !!purposeOfAccount &&
    !!sourceOfFunds &&
    idFront !== null &&
    selfie !== null &&
    liveness !== null &&
    (!requiresBack || idBack !== null)

  async function submit() {
    setError(null)
    if (!canSubmit) {
      setError('Please fill every field and attach all required files.')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('docType', docType)
      fd.append('docNumber', docNumber.trim())
      fd.append('fullLegalName', fullLegalName.trim())
      fd.append('purposeOfAccount', purposeOfAccount)
      fd.append('sourceOfFunds', sourceOfFunds)
      fd.append('idFront', idFront!)
      if (idBack) fd.append('idBack', idBack)
      fd.append('selfie', selfie!)
      fd.append('liveness', liveness!)

      const res = await fetch('/api/kyc/t2', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Submission failed (${res.status})`)
      onSubmitted()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Submit your documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Which ID are you submitting?</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {ID_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setDocType(t.value); setIdBack(null) }}
                className={cn(
                  'rounded-lg border p-3 text-left text-sm transition-colors',
                  docType === t.value
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'hover:bg-muted/50',
                )}
              >
                <p className="font-medium">{t.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.helper}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="docNumber">Document number</Label>
            <Input
              id="docNumber"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder={docType === 'nin' ? '12345678901' : docType === 'passport' ? 'A01234567' : 'ABC12345AB'}
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullLegalName">Full name as printed on ID</Label>
            <Input
              id="fullLegalName"
              value={fullLegalName}
              onChange={(e) => setFullLegalName(e.target.value)}
              placeholder="E.g. CHIOMA ADEBAYO OKAFOR"
              autoComplete="name"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>What will you use this account for?</Label>
            <Select value={purposeOfAccount} onValueChange={setPurposeOfAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSES.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Main source of funds</Label>
            <Select value={sourceOfFunds} onValueChange={setSourceOfFunds}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <FileUpload
            label="ID \u2014 front"
            hint="Clear photo of the ID front. All four corners visible, no glare."
            accept={IMAGE_TYPES}
            maxBytes={MAX_IMAGE_BYTES}
            file={idFront}
            onChange={setIdFront}
          />
          {requiresBack && (
            <FileUpload
              label="ID \u2014 back"
              hint="Driver\u2019s License back side (address, signature)."
              accept={IMAGE_TYPES}
              maxBytes={MAX_IMAGE_BYTES}
              file={idBack}
              onChange={setIdBack}
            />
          )}
          <FileUpload
            label="Selfie"
            hint="Photo of yourself holding nothing. Face fully visible, good lighting."
            accept={IMAGE_TYPES}
            maxBytes={MAX_IMAGE_BYTES}
            file={selfie}
            onChange={setSelfie}
          />
          <FileUpload
            label="Liveness"
            hint="Short video of yourself (3\u20135 s) \u2014 say your name and today\u2019s date. Or a fresh photo with your thumb clearly on your chin."
            accept={VIDEO_OR_IMAGE_TYPES}
            maxBytes={MAX_LIVENESS_BYTES}
            file={liveness}
            onChange={setLiveness}
            icon={Video}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            By submitting you confirm the information is accurate. False documents may lead to permanent account closure.
          </p>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting</>
            ) : 'Submit for review'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── File upload component ──────────────────────────────────────────────────

function FileUpload({
  label, hint, accept, maxBytes, file, onChange, icon: Icon = FileImage,
}: {
  label: string
  hint: string
  accept: string[]
  maxBytes: number
  file: File | null
  onChange: (f: File | null) => void
  icon?: React.ComponentType<{ className?: string }>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    if (!file.type.startsWith('image/')) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    if (!accept.includes(f.type)) {
      toast.error(`${label}: ${f.type} is not allowed.`)
      e.target.value = ''
      return
    }
    if (f.size > maxBytes) {
      toast.error(`${label}: file too large (max ${Math.floor(maxBytes / (1024 * 1024))} MB).`)
      e.target.value = ''
      return
    }
    onChange(f)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          max {Math.floor(maxBytes / (1024 * 1024))} MB
        </span>
      </div>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-12 w-12 rounded object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{fmtBytes(file.size)} \u00b7 {file.type}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="Remove file">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Choose a file</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        className="hidden"
        onChange={handlePick}
      />
    </div>
  )
}
