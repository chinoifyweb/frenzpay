'use client'

/**
 * /dashboard/accounts/request/[currency]
 *
 * 3-step wizard the customer goes through after KYC approval to apply
 * for a virtual bank account on a specific rail (USD / EUR / NGN). The
 * flow mirrors the design the team referenced from Grey:
 *
 *   Step 1  Confirm legal name (read-only — pulled from /api/auth/me)
 *   Step 2  Source of funds + purpose + expected monthly inflow
 *           (compliance wants this captured per-account, not just at KYC)
 *   Step 3  Submission complete — "Under review" panel, becomes
 *           "Congratulations" once an admin approves and the GET
 *           shows status === APPROVED
 *
 * On entering this page we first hit GET /api/account-requests to see
 * if the customer already has a request for this currency:
 *   PENDING   → jump straight to the success/under-review screen
 *   APPROVED  → bounce back to /dashboard/accounts (already done)
 *   REJECTED or none → show the wizard, prefilled where possible
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, CheckCircle2, Clock, Info, Loader2, Sparkles, User,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useMe, formatDisplayName } from '@/hooks/use-me'

const SUPPORTED = new Set(['USD', 'EUR', 'NGN'])
const CURRENCY_LABEL: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  NGN: 'Nigerian Naira',
}

// Match server-side enums in /api/account-requests
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
]
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
]
const INFLOW_BANDS = [
  { value: '50000',     label: 'Up to $500 / month' },
  { value: '500000',    label: '$500 – $5,000 / month' },
  { value: '1000000',   label: '$5,000 – $10,000 / month' },
  { value: '1000001',   label: 'Above $10,000 / month' },
]

export default function RequestAccountPage() {
  const params = useParams<{ currency: string }>()
  const router = useRouter()
  const { me, loading: meLoading } = useMe()

  const currency = (params?.currency || '').toUpperCase()
  const isSupported = SUPPORTED.has(currency)
  const label = CURRENCY_LABEL[currency] ?? currency

  const [step, setStep] = useState<1 | 2 | 3>(1)
  // PROCESSING is the brief in-flight state when an admin's atomic
  // approve claim is mid-call — the customer's UX should still be
  // "Pending review" during it.
  const [existingRequestStatus, setExistingRequestStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)

  const [sourceOfFunds, setSourceOfFunds] = useState('')
  const [purpose, setPurpose] = useState('')
  const [inflowCents, setInflowCents] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Look up existing requests on mount so we can short-circuit to the
  // under-review state if a customer revisits the link.
  useEffect(() => {
    if (!isSupported) { setLoadingExisting(false); return }
    fetch('/api/account-requests', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const requests: Array<{ currency: string; status: string }> = d?.requests ?? []
        const forCurrency = requests.find((r) => r.currency === currency)
        if (forCurrency?.status === 'APPROVED') {
          // Already done — back to the accounts list.
          router.replace('/dashboard/accounts')
          return
        }
        // PROCESSING surfaces to the customer as "Pending review" — same
        // UX, just means an admin is actively reviewing right now.
        if (forCurrency?.status === 'PENDING' || forCurrency?.status === 'PROCESSING') {
          setExistingRequestStatus('PENDING')
          setStep(3)
        }
        if (forCurrency?.status === 'REJECTED') {
          setExistingRequestStatus('REJECTED')
        }
      })
      .finally(() => setLoadingExisting(false))
  }, [currency, isSupported, router])

  const displayName = useMemo(() => formatDisplayName(me), [me])

  if (!isSupported) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <CardContent className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Currency not supported</h1>
            <p className="text-sm text-muted-foreground">
              We don’t support {currency || 'that currency'} yet. Pick USD, EUR, or NGN.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/accounts">Back to Accounts</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (meLoading || loadingExisting) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  // ── KYC gate ─────────────────────────────────────────────────────────────
  const tier = me?.kycTier ?? 'T0'
  if (tier === 'T0' || tier === 'T1') {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <CardContent className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Complete KYC first</h1>
            <p className="text-sm text-muted-foreground">
              You need to be verified (KYC tier T2 or above) before you can apply for a virtual {label} account.
            </p>
            <div className="flex gap-2">
              <Button asChild><Link href="/dashboard/kyc">Start KYC</Link></Button>
              <Button asChild variant="outline"><Link href="/dashboard/accounts">Cancel</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Submit step 2 → the API ──────────────────────────────────────────────
  async function submit() {
    if (!sourceOfFunds || !purpose || !inflowCents) {
      toast.error('Please fill every field.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/account-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency,
          sourceOfFunds,
          purpose,
          expectedMonthlyInflowCents: parseInt(inflowCents, 10),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      setExistingRequestStatus('PENDING')
      setStep(3)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl py-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
          <Link href="/dashboard/accounts">
            <ArrowLeft className="size-4 mr-1" /> Accounts
          </Link>
        </Button>
        <span className="text-muted-foreground/60">/</span>
        <span>Request {currency} account</span>
      </div>

      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-xs font-medium">
        {[1, 2, 3].map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>{s}</span>
            <span className={step >= s ? 'text-foreground' : 'text-muted-foreground'}>
              {s === 1 ? 'Confirm name' : s === 2 ? 'Account use' : 'Review'}
            </span>
            {s < 3 && <span className="text-muted-foreground/40">—</span>}
          </li>
        ))}
      </ol>

      {/* ── Step 1: confirm name ───────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Confirm your legal name</h1>
                <p className="text-sm text-muted-foreground">This will be the account holder name on your virtual {label} account.</p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Account holder</p>
              <p className="mt-1 text-base font-medium">{displayName || me?.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Pulled from your verified KYC submission. To change it, go through KYC again.</p>
            </div>
            <div className="rounded-lg border border-blue-200/70 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-4 flex gap-3">
              <Info className="size-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
              <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
                Virtual accounts are reviewed manually. Approval typically takes under 24 hours and you’ll get an email from accounts@frenzpay.co once it’s ready.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard/accounts">Cancel</Link>
              </Button>
              <Button onClick={() => setStep(2)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: source + purpose + inflow ──────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <h1 className="text-lg font-semibold">How will you use this {currency} account?</h1>
              <p className="text-sm text-muted-foreground">A few quick questions our compliance team needs for the application.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Where is the money coming from?</Label>
              <Select value={sourceOfFunds} onValueChange={setSourceOfFunds}>
                <SelectTrigger><SelectValue placeholder="Pick a source" /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>What will you use the account for?</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger><SelectValue placeholder="Pick a purpose" /></SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Expected monthly inflow (USD)</Label>
              <Select value={inflowCents} onValueChange={setInflowCents}>
                <SelectTrigger><SelectValue placeholder="Pick a band" /></SelectTrigger>
                <SelectContent>
                  {INFLOW_BANDS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={submitting}>
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || !sourceOfFunds || !purpose || !inflowCents}
              >
                {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Submit application
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: under review / congrats ────────────────────────────────── */}
      {step === 3 && (
        <Card className={
          existingRequestStatus === 'PENDING'
            ? 'border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20'
            : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
        }>
          <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
              existingRequestStatus === 'PENDING'
                ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}>
              {existingRequestStatus === 'PENDING' ? <Clock className="size-7" /> : <Sparkles className="size-7" />}
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-lg font-semibold">
                {existingRequestStatus === 'PENDING'
                  ? `Your ${label} account application is under review`
                  : `Your ${label} account is on the way`}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {existingRequestStatus === 'PENDING'
                  ? `Our team reviews every account application manually. You’ll get an email from accounts@frenzpay.co — usually within 24 hours — once your ${currency} account is ready.`
                  : `We’ve got your application. Sit tight — we’ll email you when it’s approved.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/accounts">Back to Accounts</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            </div>

            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs">
              <CheckCircle2 className="size-3 text-emerald-600" />
              We’ll email you at <span className="font-medium">{me?.email}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
