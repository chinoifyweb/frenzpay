'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CheckCircle2,
  Circle,
  Clock,
  Shield,
  ShieldCheck,
  Upload,
  Eye,
  EyeOff,
  AtSign,
  AlertCircle,
  Loader2,
  X,
  FileImage,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { cn, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type KYCTier = 0 | 1 | 2 | 3

type KYCStatusValue =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'

type SourceOfFunds =
  | 'employment'
  | 'freelancing'
  | 'business'
  | 'investments'
  | 'other'

type DocType = 'nin' | 'passport' | 'drivers_license' | 'voters_card'

interface KYCLimits {
  dailyTransact: string
  dailyDeposit: string
  withdrawPerDay: string
  balanceCap: string
}

interface KYCApiResponse {
  tier: KYCTier
  kycStatus: KYCStatusValue
  frenzTag: string | null
  frenzTagVerified: boolean
  pendingSubmission: { submittedAt: string; tier: KYCTier } | null
  limits: KYCLimits
}

interface UploadedFile {
  file: File
  preview: string
}

// ─── Tier metadata ────────────────────────────────────────────────────────────

const TIER_META: Array<{
  label: string
  shortLabel: string
  description: string
  dailyLimit: string
  color: string
  activeColor: string
}> = [
  {
    label: 'Tier 0',
    shortLabel: 'T0',
    description: 'Email + phone verified',
    dailyLimit: 'No transactions',
    color: 'text-muted-foreground',
    activeColor: 'text-foreground',
  },
  {
    label: 'Tier 1',
    shortLabel: 'T1',
    description: 'FrenzTag + BVN confirmed',
    dailyLimit: '$500/day',
    color: 'text-muted-foreground',
    activeColor: 'text-blue-600',
  },
  {
    label: 'Tier 2',
    shortLabel: 'T2',
    description: 'Gov ID + selfie verified',
    dailyLimit: '$5,000/day',
    color: 'text-muted-foreground',
    activeColor: 'text-emerald-600',
  },
  {
    label: 'Tier 3',
    shortLabel: 'T3',
    description: 'Enhanced due diligence',
    dailyLimit: '$50,000/day',
    color: 'text-muted-foreground',
    activeColor: 'text-purple-600',
  },
]

const DOC_TYPES: Array<{ value: DocType; label: string }> = [
  { value: 'nin', label: 'National Identity Number (NIN)' },
  { value: 'passport', label: 'International Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'voters_card', label: "Voter's Card" },
]

const SOURCE_OF_FUNDS: Array<{ value: SourceOfFunds; label: string }> = [
  { value: 'employment', label: 'Employment / Salary' },
  { value: 'freelancing', label: 'Freelancing / Contract work' },
  { value: 'business', label: 'Business income' },
  { value: 'investments', label: 'Investments / Trading' },
  { value: 'other', label: 'Other' },
]

// ─── Mock initial state (replace with real fetch) ─────────────────────────────

const MOCK_INITIAL: KYCApiResponse = {
  tier: 0,
  kycStatus: 'NOT_STARTED',
  frenzTag: null,
  frenzTagVerified: false,
  pendingSubmission: null,
  limits: {
    dailyTransact: '$0',
    dailyDeposit: '$0',
    withdrawPerDay: '$0',
    balanceCap: '$0',
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierStepper({ currentTier }: { currentTier: KYCTier }) {
  return (
    <div className="flex items-start gap-0">
      {TIER_META.map((tier, index) => {
        const tierNum = index as KYCTier
        const isCompleted = currentTier > tierNum
        const isCurrent = currentTier === tierNum
        const isUpcoming = currentTier < tierNum

        return (
          <div key={tierNum} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* Left connector */}
              <div
                className={cn(
                  'h-0.5 flex-1 transition-colors',
                  index === 0 && 'invisible',
                  isCompleted || isCurrent ? 'bg-primary' : 'bg-muted'
                )}
              />
              {/* Node */}
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                  isCompleted &&
                    'border-primary bg-primary text-primary-foreground',
                  isCurrent &&
                    'border-primary bg-background text-primary shadow-sm shadow-primary/20',
                  isUpcoming &&
                    'border-muted bg-muted/50 text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-4" />
                ) : isCurrent ? (
                  <Clock className="size-4" />
                ) : (
                  <Circle className="size-4" />
                )}
              </div>
              {/* Right connector */}
              <div
                className={cn(
                  'h-0.5 flex-1 transition-colors',
                  index === TIER_META.length - 1 && 'invisible',
                  isCompleted ? 'bg-primary' : 'bg-muted'
                )}
              />
            </div>
            {/* Labels */}
            <div className="mt-2 flex flex-col items-center gap-0.5 px-1 text-center">
              <span
                className={cn(
                  'text-xs font-semibold',
                  isCompleted || isCurrent
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {tier.label}
              </span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                {tier.dailyLimit}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DropZone({
  label,
  required,
  file,
  onFileSelect,
  onRemove,
}: {
  label: string
  required?: boolean
  file: UploadedFile | null
  onFileSelect: (f: UploadedFile) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const processFile = useCallback(
    (raw: File) => {
      if (!raw.type.startsWith('image/')) {
        toast.error('Only image files are accepted')
        return
      }
      if (raw.size > 10 * 1024 * 1024) {
        toast.error('File must be under 10 MB')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        onFileSelect({ file: raw, preview: e.target?.result as string })
      }
      reader.readAsDataURL(raw)
    },
    [onFileSelect]
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const raw = e.dataTransfer.files[0]
    if (raw) processFile(raw)
  }

  if (file) {
    return (
      <div className="relative overflow-hidden rounded-lg border bg-muted/30">
        <img
          src={file.preview}
          alt={label}
          className="h-36 w-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-between p-2">
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto flex size-6 items-center justify-center rounded-full bg-background/90 shadow transition-opacity hover:opacity-80"
            aria-label={`Remove ${label}`}
          >
            <X className="size-3.5" />
          </button>
          <p className="truncate rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium">
            {file.file.name}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
      )}
    >
      <FileImage className="size-7 text-muted-foreground" />
      <div className="text-center">
        <p className="text-xs font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Click or drag &amp; drop · JPG/PNG · max 10 MB
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const raw = e.target.files?.[0]
          if (raw) processFile(raw)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KYCPage() {
  // ── KYC state fetched from API ─────────────────────────────────────────────
  const [kycData, setKycData] = useState<KYCApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── FrenzTag state ─────────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState('')
  const [isEditingTag, setIsEditingTag] = useState(false)
  const [tagAvailability, setTagAvailability] = useState<
    'idle' | 'checking' | 'available' | 'unavailable'
  >('idle')
  const [isClaimingTag, setIsClaimingTag] = useState(false)
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── T1 BVN state ───────────────────────────────────────────────────────────
  const [fullLegalName, setFullLegalName] = useState('')
  const [bvn, setBvn] = useState('')
  const [showBvn, setShowBvn] = useState(false)
  const [isSubmittingT1, setIsSubmittingT1] = useState(false)

  // ── T2 document state ──────────────────────────────────────────────────────
  const [docType, setDocType] = useState<DocType | ''>('')
  const [docNumber, setDocNumber] = useState('')
  const [sourceOfFunds, setSourceOfFunds] = useState<SourceOfFunds | ''>('')
  const [idFront, setIdFront] = useState<UploadedFile | null>(null)
  const [idBack, setIdBack] = useState<UploadedFile | null>(null)
  const [selfie, setSelfie] = useState<UploadedFile | null>(null)
  const [isSubmittingT2, setIsSubmittingT2] = useState(false)

  // ── Fetch KYC status ───────────────────────────────────────────────────────
  useEffect(() => {
    const fetchKYC = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/api/kyc')
        if (!res.ok) throw new Error('Failed to load KYC data')
        const data: KYCApiResponse = await res.json()
        setKycData(data)
        if (data.frenzTag) setTagInput(data.frenzTag)
      } catch {
        // Fall back to mock data so UI still renders in dev / demo
        setKycData(MOCK_INITIAL)
      } finally {
        setIsLoading(false)
      }
    }
    fetchKYC()
  }, [])

  // ── Debounced tag availability check ──────────────────────────────────────
  useEffect(() => {
    if (!isEditingTag) return
    if (!tagInput || tagInput.length < 3) {
      setTagAvailability('idle')
      return
    }
    setTagAvailability('checking')
    if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current)
    tagDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/frenz-tag?tag=${encodeURIComponent(tagInput)}`
        )
        const data: { available: boolean } = await res.json()
        setTagAvailability(data.available ? 'available' : 'unavailable')
      } catch {
        setTagAvailability('idle')
      }
    }, 500)
    return () => {
      if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current)
    }
  }, [tagInput, isEditingTag])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleClaimTag = async () => {
    if (!tagInput || tagAvailability !== 'available') return
    setIsClaimingTag(true)
    try {
      const res = await fetch('/api/frenz-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tagInput }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Failed to claim tag')
      }
      setKycData((prev) =>
        prev
          ? { ...prev, frenzTag: tagInput, frenzTagVerified: true }
          : prev
      )
      setIsEditingTag(false)
      setTagAvailability('idle')
      toast.success(`@${tagInput} is now yours!`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not claim tag')
    } finally {
      setIsClaimingTag(false)
    }
  }

  const handleSubmitT1 = async () => {
    if (!fullLegalName.trim()) {
      toast.error('Please enter your full legal name')
      return
    }
    if (!/^\d{11}$/.test(bvn)) {
      toast.error('BVN must be exactly 11 digits')
      return
    }
    setIsSubmittingT1(true)
    try {
      const res = await fetch('/api/kyc/t1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullLegalName: fullLegalName.trim(), bvn }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Submission failed')
      }
      setKycData((prev) =>
        prev
          ? {
              ...prev,
              kycStatus: 'PENDING',
              pendingSubmission: {
                submittedAt: new Date().toISOString(),
                tier: 1,
              },
            }
          : prev
      )
      toast.success('BVN submitted for verification')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmittingT1(false)
    }
  }

  const handleSubmitT2 = async () => {
    if (!docType) {
      toast.error('Please select an ID type')
      return
    }
    if (!docNumber.trim()) {
      toast.error('Please enter your document number')
      return
    }
    if (!sourceOfFunds) {
      toast.error('Please select a source of funds')
      return
    }
    if (!idFront) {
      toast.error('Please upload the front of your ID')
      return
    }
    if (!selfie) {
      toast.error('Please upload a selfie')
      return
    }
    setIsSubmittingT2(true)
    try {
      const formData = new FormData()
      formData.append('docType', docType)
      formData.append('docNumber', docNumber.trim())
      formData.append('sourceOfFunds', sourceOfFunds)
      formData.append('idFront', idFront.file)
      if (idBack) formData.append('idBack', idBack.file)
      formData.append('selfie', selfie.file)

      const res = await fetch('/api/kyc/t2', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Submission failed')
      }
      setKycData((prev) =>
        prev
          ? {
              ...prev,
              kycStatus: 'PENDING',
              pendingSubmission: {
                submittedAt: new Date().toISOString(),
                tier: 2,
              },
            }
          : prev
      )
      toast.success("Documents submitted for review. We'll notify you within 1-2 business days.")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmittingT2(false)
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const showFrenzTagSection =
    kycData !== null && (kycData.tier === 0 || kycData.tier === 1)

  const showBVNSection =
    kycData !== null &&
    kycData.frenzTagVerified &&
    kycData.tier < 1

  const showT2Section = kycData !== null && kycData.tier === 1

  const currentTierMeta = kycData ? TIER_META[kycData.tier] : null

  const tierProgressValue = kycData ? (kycData.tier / 3) * 100 : 0

  const tagFeedback = (() => {
    if (!isEditingTag || !tagInput || tagInput.length < 3) return null
    if (tagAvailability === 'checking')
      return { icon: <Loader2 className="size-3.5 animate-spin" />, color: 'text-muted-foreground', text: 'Checking...' }
    if (tagAvailability === 'available')
      return { icon: <CheckCircle2 className="size-3.5" />, color: 'text-emerald-600', text: '@' + tagInput + ' is available' }
    if (tagAvailability === 'unavailable')
      return { icon: <X className="size-3.5" />, color: 'text-destructive', text: '@' + tagInput + ' is taken' }
    return null
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!kycData) return null

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Identity Verification
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete your KYC to unlock higher transaction limits
        </p>
      </div>

      {/* ── Pending review banner ───────────────────────────────────────────── */}
      {kycData.pendingSubmission && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
          <Clock className="size-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <span className="font-medium">Your submission is under review.</span>{' '}
            Submitted on{' '}
            {formatDate(kycData.pendingSubmission.submittedAt)} for Tier{' '}
            {kycData.pendingSubmission.tier} verification. We typically
            review within 1–2 business days.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Tier progress card ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Verification Level
            </CardTitle>
            <Badge
              variant={kycData.tier >= 2 ? 'default' : 'outline'}
              className={cn(
                kycData.tier === 0 && 'border-muted-foreground/40 text-muted-foreground',
                kycData.tier === 1 && 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400',
                kycData.tier >= 2 && ''
              )}
            >
              {currentTierMeta?.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Step stepper */}
          <TierStepper currentTier={kycData.tier} />

          {/* Progress bar */}
          <Progress value={tierProgressValue} className="h-1.5" />

          {/* Current tier description */}
          <p className="text-sm text-muted-foreground">
            {currentTierMeta?.description} &mdash;{' '}
            <span className="font-medium text-foreground">
              {currentTierMeta?.dailyLimit}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ── Tier benefits card ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" />
            Your Current Limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { label: 'Daily transactions', value: kycData.limits.dailyTransact },
                { label: 'Daily deposits', value: kycData.limits.dailyDeposit },
                { label: 'Daily withdrawals', value: kycData.limits.withdrawPerDay },
                { label: 'Balance cap', value: kycData.limits.balanceCap },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-bold">{item.value}</p>
              </div>
            ))}
          </div>
          {kycData.tier < 3 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Complete verification to increase your limits
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── FrenzTag section (T0 / T1) ─────────────────────────────────────── */}
      {showFrenzTagSection && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AtSign className="size-4" />
                  Your FrenzTag
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Claim a unique tag to receive money and advance to Tier 1
                </p>
              </div>
              {kycData.frenzTag && !isEditingTag && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Claimed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Show existing tag, or edit/claim form */}
            {kycData.frenzTag && !isEditingTag ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 flex-1 items-center rounded-lg border bg-muted/50 px-3">
                  <AtSign className="mr-1.5 size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{kycData.frenzTag}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingTag(true)
                    setTagAvailability('idle')
                  }}
                >
                  Change tag
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="frenz-tag">FrenzTag</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="frenz-tag"
                      value={tagInput}
                      onChange={(e) => {
                        const val = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, '')
                          .slice(0, 20)
                        setTagInput(val)
                        setIsEditingTag(true)
                      }}
                      placeholder="yourname"
                      className="pl-9"
                      aria-describedby="frenz-tag-hint frenz-tag-feedback"
                    />
                  </div>
                  <Button
                    onClick={handleClaimTag}
                    disabled={
                      isClaimingTag ||
                      tagAvailability !== 'available' ||
                      !tagInput
                    }
                  >
                    {isClaimingTag ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      'Claim tag'
                    )}
                  </Button>
                </div>

                {/* Feedback row */}
                {tagFeedback && (
                  <p
                    id="frenz-tag-feedback"
                    className={cn('flex items-center gap-1 text-xs', tagFeedback.color)}
                  >
                    {tagFeedback.icon}
                    {tagFeedback.text}
                  </p>
                )}

                <p
                  id="frenz-tag-hint"
                  className="text-xs text-muted-foreground"
                >
                  3–20 characters, lowercase letters, numbers, or underscores
                </p>

                {kycData.frenzTag && isEditingTag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      setTagInput(kycData.frenzTag!)
                      setIsEditingTag(false)
                      setTagAvailability('idle')
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── BVN verification section (T1 — tag claimed, not yet T1 approved) ─ */}
      {showBVNSection && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4" />
              BVN Verification
              <Badge variant="outline" className="ml-1 text-[10px]">
                Tier 1
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Confirm your Bank Verification Number to unlock{' '}
              <span className="font-medium text-foreground">$500/day</span>{' '}
              limits
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-legal-name">Full legal name</Label>
              <Input
                id="full-legal-name"
                value={fullLegalName}
                onChange={(e) => setFullLegalName(e.target.value)}
                placeholder="As it appears on your BVN"
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bvn-input">BVN (Bank Verification Number)</Label>
              <div className="relative">
                <Input
                  id="bvn-input"
                  type={showBvn ? 'text' : 'password'}
                  inputMode="numeric"
                  value={bvn}
                  onChange={(e) =>
                    setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))
                  }
                  placeholder="11-digit BVN"
                  maxLength={11}
                  className="pr-10"
                  aria-describedby="bvn-hint"
                />
                <button
                  type="button"
                  onClick={() => setShowBvn((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showBvn ? 'Hide BVN' : 'Show BVN'}
                >
                  {showBvn ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p id="bvn-hint" className="text-xs text-muted-foreground">
                Dial <span className="font-mono">*565*0#</span> to retrieve your
                BVN
              </p>
            </div>

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
              <AlertCircle className="size-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                Your BVN is encrypted in transit and never stored in plain text.
                It is used solely to verify your identity.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                onClick={handleSubmitT1}
                disabled={
                  isSubmittingT1 ||
                  !fullLegalName.trim() ||
                  bvn.length !== 11
                }
              >
                {isSubmittingT1 ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  'Submit for Verification'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Document upload section (T2) ────────────────────────────────────── */}
      {showT2Section && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" />
              Document Verification
              <Badge variant="outline" className="ml-1 text-[10px]">
                Tier 2
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload a government-issued ID and selfie to unlock{' '}
              <span className="font-medium text-foreground">$5,000/day</span>{' '}
              limits
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Doc type + number */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="doc-type">ID document type</Label>
                <select
                  id="doc-type"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-label="Select ID document type"
                >
                  <option value="">Select document type</option>
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-number">Document number</Label>
                <Input
                  id="doc-number"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="Enter document number"
                />
              </div>
            </div>

            {/* Source of funds */}
            <div className="space-y-2">
              <Label htmlFor="source-of-funds">Source of funds</Label>
              <select
                id="source-of-funds"
                value={sourceOfFunds}
                onChange={(e) =>
                  setSourceOfFunds(e.target.value as SourceOfFunds)
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Select source of funds"
              >
                <option value="">Select source of funds</option>
                {SOURCE_OF_FUNDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* File uploads */}
            <div className="space-y-3">
              <Label>Documents</Label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    ID front <span className="text-destructive">*</span>
                  </p>
                  <DropZone
                    label="ID Front"
                    required
                    file={idFront}
                    onFileSelect={setIdFront}
                    onRemove={() => setIdFront(null)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    ID back{' '}
                    <span className="text-muted-foreground/60">(optional)</span>
                  </p>
                  <DropZone
                    label="ID Back (optional)"
                    file={idBack}
                    onFileSelect={setIdBack}
                    onRemove={() => setIdBack(null)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Selfie <span className="text-destructive">*</span>
                  </p>
                  <DropZone
                    label="Selfie"
                    required
                    file={selfie}
                    onFileSelect={setSelfie}
                    onRemove={() => setSelfie(null)}
                  />
                </div>
              </div>
            </div>

            {/* Selfie tips */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Selfie tips</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                <li>Face the camera directly with good, even lighting</li>
                <li>Remove hats, glasses, or face coverings</li>
                <li>Use a plain, uncluttered background</li>
                <li>Ensure your entire face is visible and in focus</li>
              </ul>
            </div>

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
              <AlertCircle className="size-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                Documents are encrypted and used only for identity verification.
                We do not share your data with third parties without consent.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                onClick={handleSubmitT2}
                disabled={
                  isSubmittingT2 ||
                  !docType ||
                  !docNumber.trim() ||
                  !sourceOfFunds ||
                  !idFront ||
                  !selfie
                }
              >
                {isSubmittingT2 ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  'Submit Documents'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Fully verified state ────────────────────────────────────────────── */}
      {kycData.tier >= 2 && kycData.kycStatus === 'APPROVED' && (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <ShieldCheck className="size-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold">Identity Verified</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Your identity has been confirmed. You have access to enhanced
              transaction limits on FrenzPay.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
