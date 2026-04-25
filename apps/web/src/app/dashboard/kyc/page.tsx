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
  Video as VideoIcon,
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
  { value: 'drivers_license', label: 'Driver’s License', helper: 'Front AND back required', requiresBack: true },
  { value: 'passport', label: 'International Passport', helper: 'Photo page', requiresBack: false },
  { value: 'voters_card', label: 'Voter’s Card (PVC)', helper: 'Front AND back required', requiresBack: true },
] as const
type IdType = (typeof ID_TYPES)[number]['value']

const PURPOSES = [
  { value: 'personal', label: 'Personal use' },
  { value: 'freelance', label: 'Freelance / contractor income' },
  { value: 'amazon_kdp', label: 'Amazon KDP royalties' },
  { value: 'amazon_associates', label: 'Amazon Associates / affiliate' },
  { value: 'upwork', label: 'Upwork earnings' },
  { value: 'youtube', label: 'YouTube / AdSense payouts' },
  { value: 'content_creator', label: 'Content creator (Patreon, Substack, etc.)' },
  { value: 'dropshipping', label: 'Dropshipping / e-commerce' },
  { value: 'saas', label: 'SaaS / product sales' },
  { value: 'crypto_trading', label: 'Crypto trading' },
  { value: 'investment', label: 'Stock / FX trading' },
  { value: 'remittance', label: 'Remittance / family support' },
  { value: 'business', label: 'Registered business / company' },
  { value: 'other', label: 'Other' },
] as const

const SOURCES = [
  { value: 'salary', label: 'Salary / employment' },
  { value: 'freelance', label: 'Freelance / contract work' },
  { value: 'amazon_kdp', label: 'Amazon KDP / book royalties' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'toptal', label: 'Toptal' },
  { value: 'youtube', label: 'YouTube / AdSense' },
  { value: 'patreon', label: 'Patreon / subscriptions' },
  { value: 'ecommerce', label: 'E-commerce / Shopify / Etsy' },
  { value: 'dropshipping', label: 'Dropshipping' },
  { value: 'saas', label: 'SaaS / product revenue' },
  { value: 'consulting', label: 'Consulting fees' },
  { value: 'crypto', label: 'Crypto / DeFi' },
  { value: 'investments', label: 'Investments / dividends' },
  { value: 'business', label: 'Registered business revenue' },
  { value: 'savings', label: 'Personal savings' },
  { value: 'gift', label: 'Gift / family support' },
  { value: 'other', label: 'Other' },
] as const

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
// Liveness is now an upload-only flow — customers were running into
// camera-permission walls on Android Brave / locked-down browsers and
// bouncing off KYC entirely. The customer records on their own using
// their phone's camera app and uploads the clip; admin matches it
// manually against the selfie + ID. Mirrors the server allow-list in
// /api/kyc/t2 (ALLOWED_VIDEO_MIME).
const VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
  'video/x-matroska',
]
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

// Nigerian state 2-letter codes as expected by Graph's address object.
const NG_STATES = [
  { code: 'AB', name: 'Abia' }, { code: 'AD', name: 'Adamawa' },
  { code: 'AK', name: 'Akwa Ibom' }, { code: 'AN', name: 'Anambra' },
  { code: 'BA', name: 'Bauchi' }, { code: 'BY', name: 'Bayelsa' },
  { code: 'BE', name: 'Benue' }, { code: 'BO', name: 'Borno' },
  { code: 'CR', name: 'Cross River' }, { code: 'DE', name: 'Delta' },
  { code: 'EB', name: 'Ebonyi' }, { code: 'ED', name: 'Edo' },
  { code: 'EK', name: 'Ekiti' }, { code: 'EN', name: 'Enugu' },
  { code: 'FC', name: 'Federal Capital Territory (Abuja)' },
  { code: 'GO', name: 'Gombe' }, { code: 'IM', name: 'Imo' },
  { code: 'JI', name: 'Jigawa' }, { code: 'KD', name: 'Kaduna' },
  { code: 'KN', name: 'Kano' }, { code: 'KT', name: 'Katsina' },
  { code: 'KE', name: 'Kebbi' }, { code: 'KO', name: 'Kogi' },
  { code: 'KW', name: 'Kwara' }, { code: 'LA', name: 'Lagos' },
  { code: 'NA', name: 'Nasarawa' }, { code: 'NI', name: 'Niger' },
  { code: 'OG', name: 'Ogun' }, { code: 'ON', name: 'Ondo' },
  { code: 'OS', name: 'Osun' }, { code: 'OY', name: 'Oyo' },
  { code: 'PL', name: 'Plateau' }, { code: 'RI', name: 'Rivers' },
  { code: 'SO', name: 'Sokoto' }, { code: 'TA', name: 'Taraba' },
  { code: 'YO', name: 'Yobe' }, { code: 'ZA', name: 'Zamfara' },
] as const

const EMPLOYMENT_STATUSES = [
  { value: 'employed', label: 'Employed (salaried)' },
  { value: 'self_employed', label: 'Self-employed / business owner' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
] as const

// Expected-monthly-inflow bands. Server stores `expectedMonthlyInflowCents`
// as USD cents (BigInt) so the values here are the cents amount to send.
// "above" buckets to a sentinel of 1,000,001 USD-cents-equivalent so it sorts
// strictly above the $10,000 entry and the admin can easily see the bracket.
const INFLOW_BANDS = [
  { value: '50000',     label: 'Up to $500 / month' },
  { value: '500000',    label: '$500 – $5,000 / month' },
  { value: '1000000',   label: '$5,000 – $10,000 / month' },
  { value: '1000001',   label: 'Above $10,000 / month' },
] as const

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// ── Page ───────────────────────────────────────────────────────────────────

type KycState = 'loading' | 'not_started' | 'pending' | 'approved' | 'rejected'

interface RejectionTemplate { code: string; customerMessage: string; actions: string[] }
interface PrefillData {
  docKind: 'nin' | 'passport' | 'drivers_license' | null
  docNumber: string | null
  fullLegalName: string | null
  bvn: string | null
  sourceOfFunds: string | null
  purposeOfAccount: string | null
  employmentStatus: string | null
  occupation: string | null
  expectedMonthlyInflowCents: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  addressState: string | null
  postalCode: string | null
}

export default function KycPage() {
  const { me, loading: meLoading, refresh } = useMe()

  const [state, setState] = useState<KycState>('loading')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [rejectionTemplate, setRejectionTemplate] = useState<RejectionTemplate | null>(null)
  const [prefill, setPrefill] = useState<PrefillData | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (meLoading) { setState('loading'); return }
    // /api/auth/me can return 401 even when the cookie passes middleware
    // (cookie valid but Redis session expired). useMe sets `me` to null
    // and `loading` to false in that case. Send the user to /login
    // instead of leaving the page stuck on a Skeleton forever.
    if (!me) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
      }
      return
    }
    const tier = me.kycTier
    const status = me.kycStatus
    if (tier === 'T2' || tier === 'T3') {
      setState('approved')
      return
    }
    if (status === 'PENDING_REVIEW') { setState('pending'); return }

    // Hit /api/kyc for rejection details + prefill data. Fire for every
    // non-pending case (REJECTED *and* NOT_STARTED) — even if the user
    // hasn't been rejected this session, they may have address fields
    // saved from a prior submission attempt that we can prefill.
    fetch('/api/kyc', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.lastSubmission?.rejectionReason) {
          setRejectionReason(d.lastSubmission.rejectionReason)
        }
        if (d?.lastSubmission?.rejectionTemplate) {
          setRejectionTemplate(d.lastSubmission.rejectionTemplate as RejectionTemplate)
        }
        if (d?.lastSubmission?.prefill) {
          setPrefill(d.lastSubmission.prefill as PrefillData)
        }
      })
      .catch(() => { /* non-fatal — prefill just won't happen */ })

    if (status === 'REJECTED') setState('rejected')
    else setState('not_started')
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
        <RejectedCard
          reason={rejectionReason}
          template={rejectionTemplate}
          onResubmit={() => setShowForm(true)}
        />
      )}

      {(state === 'not_started' || (state === 'rejected' && showForm)) && (
        <KycForm
          // On a rejection we hand the form whatever we could decrypt from
          // the last submission so the customer doesn't re-type fields
          // they already filled. They only fix what was flagged.
          prefill={prefill}
          onSubmitted={() => {
            toast.success('Submitted — we’ll email you within 24 hours.')
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
            You’re all set. Head to your wallet to activate a USD or EUR account and start receiving payments.
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
            We’ve got your documents. Our team reviews every submission manually — you’ll hear back by email within 24 hours.
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

function RejectedCard({
  reason,
  template,
  onResubmit,
}: {
  reason: string | null
  template: RejectionTemplate | null
  onResubmit: () => void
}) {
  const actions = template?.actions ?? []
  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <CardContent className="flex flex-col gap-5 py-8 px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Verification declined</h2>
            <p className="text-sm text-muted-foreground">
              We need a bit more from you before we can verify your identity.
            </p>
          </div>
        </div>

        {reason && (
          <div className="rounded-lg border border-red-300/70 bg-background px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-red-700/80 dark:text-red-400/80 mb-1">Reason</p>
            <p className="text-foreground leading-relaxed">{reason}</p>
          </div>
        )}

        {actions.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">What to do</p>
            <ol className="space-y-2">
              {actions.map((step, idx) => (
                <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Your previous answers are still saved — open the form and fix only what&rsquo;s flagged above.
        </p>

        <div className="flex justify-end">
          <Button onClick={onResubmit}>Resubmit verification</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Form ───────────────────────────────────────────────────────────────────

function KycForm({
  onSubmitted,
  prefill,
}: {
  onSubmitted: () => void
  prefill: PrefillData | null
}) {
  // Prefill on mount from the last submission. Files are NEVER prefilled
  // (they live encrypted on disk under a per-DEK envelope and the
  // browser can't reconstruct a File handle from a server-decrypted
  // blob without re-uploading) so the customer always re-attaches the
  // ID / liveness / proof-of-address. That's intentional: rejected
  // submissions usually need at least one fresh photo anyway.
  const [docType, setDocType] = useState<IdType>(prefill?.docKind ?? 'nin')
  const [docNumber, setDocNumber] = useState(prefill?.docNumber ?? '')
  const [fullLegalName, setFullLegalName] = useState(prefill?.fullLegalName ?? '')
  const [bvn, setBvn] = useState(prefill?.bvn ?? '')
  const [purposeOfAccount, setPurposeOfAccount] = useState(prefill?.purposeOfAccount ?? '')
  const [sourceOfFunds, setSourceOfFunds] = useState(prefill?.sourceOfFunds ?? '')

  // Address — required by Graph for both NGN + USD virtual accounts.
  const [addressLine1, setAddressLine1] = useState(prefill?.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(prefill?.addressLine2 ?? '')
  const [city, setCity] = useState(prefill?.city ?? '')
  const [addressState, setAddressState] = useState(prefill?.addressState ?? '')
  const [postalCode, setPostalCode] = useState(prefill?.postalCode ?? '')

  // background_information — Graph requires it for USD accounts. We collect
  // it for every submission so the USD rail is unlocked automatically after
  // approval.
  const [employmentStatus, setEmploymentStatus] = useState(prefill?.employmentStatus ?? '')
  const [occupation, setOccupation] = useState(prefill?.occupation ?? '')
  const [expectedMonthlyInflowUsd, setExpectedMonthlyInflowUsd] = useState(prefill?.expectedMonthlyInflowCents ?? '')

  const [idFront, setIdFront] = useState<File | null>(null)
  const [idBack, setIdBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [liveness, setLiveness] = useState<File | null>(null)
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresBack = ID_TYPES.find(t => t.value === docType)?.requiresBack ?? false

  const canSubmit =
    docNumber.trim().length >= 5 &&
    fullLegalName.trim().length >= 4 &&
    !!purposeOfAccount &&
    !!sourceOfFunds &&
    addressLine1.trim().length >= 4 &&
    city.trim().length >= 2 &&
    !!addressState &&
    postalCode.trim().length >= 4 &&
    !!employmentStatus &&
    occupation.trim().length >= 2 &&
    expectedMonthlyInflowUsd.trim().length > 0 &&
    idFront !== null &&
    selfie !== null &&
    liveness !== null &&
    proofOfAddress !== null &&
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
      if (bvn.trim()) fd.append('bvn', bvn.trim())
      fd.append('purposeOfAccount', purposeOfAccount)
      fd.append('sourceOfFunds', sourceOfFunds)

      // Address fields
      fd.append('addressLine1', addressLine1.trim())
      if (addressLine2.trim()) fd.append('addressLine2', addressLine2.trim())
      fd.append('city', city.trim())
      fd.append('addressState', addressState)
      fd.append('postalCode', postalCode.trim())

      // background_information
      fd.append('employmentStatus', employmentStatus)
      fd.append('occupation', occupation.trim())
      // expectedMonthlyInflowUsd holds the cents value directly now (band picker)
      fd.append('expectedMonthlyInflowCents', expectedMonthlyInflowUsd)

      fd.append('idFront', idFront!)
      if (idBack) fd.append('idBack', idBack)
      fd.append('selfie', selfie!)
      fd.append('liveness', liveness!)
      fd.append('proofOfAddress', proofOfAddress!)

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
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              Enter your name <span className="font-medium">exactly as it appears on your ID</span> — same spelling, same order, same spacing. If your ID has no middle name, leave it out here too. Mismatches are the #1 reason KYC gets rejected.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bvn">BVN (Bank Verification Number)</Label>
          <Input
            id="bvn"
            value={bvn}
            onChange={(e) => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
            className="font-mono"
            maxLength={11}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Required for NGN payouts. Dial *565*0# from a phone registered to your bank to retrieve.
          </p>
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

        {/* ── Residential address ─────────────────────────────────────── */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <div>
            <p className="font-medium text-sm">Residential Address</p>
            <p className="text-xs text-muted-foreground">
              As it appears on your proof-of-address document (utility bill / bank statement / tenancy agreement).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addressLine1">Street address</Label>
            <Input
              id="addressLine1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              autoComplete="address-line1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addressLine2">Apt / suite / floor (optional)</Label>
            <Input
              id="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              autoComplete="address-line2"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={addressState} onValueChange={setAddressState}>
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {NG_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="font-mono"
                autoComplete="postal-code"
              />
            </div>
          </div>
        </div>

        {/* ── Employment + inflow (background_information) ────────────── */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <div>
            <p className="font-medium text-sm">Employment</p>
            <p className="text-xs text-muted-foreground">
              Needed for USD virtual account compliance.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Employment status</Label>
              <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_STATUSES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occupation">Occupation / job title</Label>
              <Input
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                autoComplete="organization-title"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected monthly inflow (USD)</Label>
            <Select value={expectedMonthlyInflowUsd} onValueChange={setExpectedMonthlyInflowUsd}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a band" />
              </SelectTrigger>
              <SelectContent>
                {INFLOW_BANDS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Rough estimate of USD you expect to receive per month.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <FileUpload
            label="ID — front"
            hint="Clear photo of the ID front. All four corners visible, no glare."
            accept={IMAGE_TYPES}
            maxBytes={MAX_IMAGE_BYTES}
            file={idFront}
            onChange={setIdFront}
          />
          {requiresBack && (
            <FileUpload
              label="ID — back"
              hint="Driver’s License back side (address, signature)."
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
          {/* Liveness — upload-only. The in-browser recorder hit too many
              camera-permission walls on Android Brave + corp-MDM browsers,
              so we let the customer record on their phone's native camera
              app and upload the clip. A reviewer matches the face + voice
              against the selfie + ID manually. */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            <p className="font-medium mb-1.5">📹 How to record your liveness video</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Open your phone’s camera app and switch to the <span className="font-medium">front camera (selfie)</span>.</li>
              <li>Hold the phone at face height, good lighting, no hat or sunglasses.</li>
              <li>Hit record and clearly say: <span className="italic">“My name is [your full name], and today is [today’s date].”</span></li>
              <li>Slowly turn your head <span className="font-medium">left, then right, then up</span> — a few seconds in each direction.</li>
              <li>Stop recording. Total length: <span className="font-medium">5–15 seconds</span>. Keep the file under 25 MB.</li>
              <li>Tap the upload box below and pick the clip from your gallery.</li>
            </ol>
          </div>
          <FileUpload
            label="Liveness video"
            hint="Selfie video saying your name + today’s date, with head turns left/right/up. MP4, MOV, WebM, MKV, or 3GP."
            accept={VIDEO_TYPES}
            maxBytes={MAX_VIDEO_BYTES}
            file={liveness}
            onChange={setLiveness}
            icon={VideoIcon}
          />
          <FileUpload
            label="Proof of address"
            hint="Recent (last 3 months) utility bill, bank statement, or tenancy agreement showing your name + the address above."
            accept={IMAGE_TYPES}
            maxBytes={MAX_IMAGE_BYTES}
            file={proofOfAddress}
            onChange={setProofOfAddress}
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
    // Some Android galleries strip the mime on picked files. Fall back to
    // the extension if the mime is missing — but never if the mime is
    // present-and-wrong. This stops images sneaking into the video slot
    // (they'd have a real image/* mime that would fail the explicit
    // check) while still letting through 3GP / MKV gallery picks.
    const mime = (f.type || '').toLowerCase()
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const EXT_TO_MIME: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
      mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
      mov: 'video/quicktime', qt: 'video/quicktime', mkv: 'video/x-matroska',
      '3gp': 'video/3gpp', '3gpp': 'video/3gpp',
    }
    const inferred = EXT_TO_MIME[ext]
    const effective = mime || inferred || ''
    if (!effective || !accept.includes(effective)) {
      toast.error(`${label}: ${mime || `.${ext}` || 'this file'} is not allowed.`)
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
            <p className="text-xs text-muted-foreground">{fmtBytes(file.size)} · {file.type}</p>
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
