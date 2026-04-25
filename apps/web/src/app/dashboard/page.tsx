'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  Circle,
  CreditCard,
  PiggyBank,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet as WalletIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe, formatDisplayName } from '@/hooks/use-me'

type Currency = 'USD' | 'NGN' | 'USDC'

interface AccountsResponse {
  accounts: Array<{ id: string; currency: Currency; subtype: string; balance: string }>
  available: Partial<Record<Currency, string>>
}

interface TxRow {
  id: string
  type: string
  status: string
  amount: string
  currency: string
  direction: 'in' | 'out' | 'internal'
  createdAt: string
  postedAt: string | null
}

const DECIMALS: Record<Currency, number> = { USD: 2, NGN: 2, USDC: 6 }
const SYMBOL: Record<Currency, string> = { USD: '$', NGN: '₦', USDC: '' }
const CURRENCY_GRADIENT: Record<Currency, string> = {
  USD: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
  NGN: 'from-sky-500/10 via-sky-500/5 to-transparent',
  USDC: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
}

function formatMinor(amount: string, currency: Currency): string {
  const raw = (amount ?? '0').replace(/[^0-9]/g, '') || '0'
  const decimals = DECIMALS[currency]
  const padded = raw.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  let fraction = padded.slice(padded.length - decimals)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (currency === 'USDC') {
    fraction = fraction.replace(/0+$/, '')
    if (fraction.length < 2) fraction = fraction.padEnd(2, '0')
    return `${grouped}.${fraction} USDC`
  }
  return `${SYMBOL[currency]}${grouped}.${fraction}`
}

const KYC_TIERS = ['T0', 'T1', 'T2', 'T3'] as const
const KYC_LABEL = { T0: 'Basic', T1: 'Verified', T2: 'Advanced', T3: 'Premium' } as const

export default function DashboardOverview() {
  const { me, loading: meLoading } = useMe()

  const [accounts, setAccounts] = useState<AccountsResponse | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [recent, setRecent] = useState<TxRow[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [provisioning, setProvisioning] = useState(false)

  // Setup-progress strip: pulls just enough side-state (mfa enrolled,
  // open account requests) to show a 0/5 → 5/5 progress ring like Grey's
  // "Continue setup" bar. Each step is a piece of the post-signup
  // funnel; once all 5 are done the strip hides itself.
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null)
  const [hasAccountRequest, setHasAccountRequest] = useState<boolean | null>(null)

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await fetch('/api/accounts', { cache: 'no-store' })
      if (res.ok) setAccounts(await res.json())
    } finally { setAccountsLoading(false) }
  }, [])

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true)
    try {
      const res = await fetch('/api/transactions?limit=5', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setRecent(json.transactions ?? [])
      }
    } finally { setRecentLoading(false) }
  }, [])

  useEffect(() => { void fetchAccounts(); void fetchRecent() }, [fetchAccounts, fetchRecent])

  // Background fetch for the progress strip. Failures are non-fatal —
  // the strip just doesn't show that step as complete, no error UI.
  useEffect(() => {
    void fetch('/api/auth/mfa', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMfaEnrolled(!!d?.enrolled))
      .catch(() => setMfaEnrolled(false))
    void fetch('/api/account-requests', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasAccountRequest((d?.requests ?? []).length > 0))
      .catch(() => setHasAccountRequest(false))
  }, [])

  async function activateWallet() {
    setProvisioning(true)
    try {
      const res = await fetch('/api/accounts/provision', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      toast.success('Wallet activated')
      await fetchAccounts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate')
    } finally { setProvisioning(false) }
  }

  const displayName = formatDisplayName(me)
  const firstName = me?.firstName || displayName.split(' ')[0] || 'there'
  const greeting = getGreeting()

  const kycTier = me?.kycTier ?? 'T0'
  const tierIndex = KYC_TIERS.indexOf(kycTier)
  const kycProgress = ((tierIndex + 1) / KYC_TIERS.length) * 100

  const hasAccounts = (accounts?.accounts.length ?? 0) > 0
  const currencies: Currency[] = ['USD', 'NGN', 'USDC']

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {meLoading ? <Skeleton className="h-8 w-48" /> : `Hi, ${firstName} 👋`}
        </h1>
      </div>

      {/* Setup-progress strip — modelled on Grey's "Continue setup".
          Five post-signup milestones: email verified, KYC approved,
          2FA enrolled, first account requested, first deposit. Hides
          itself once all 5 are done so it doesn't loiter on
          long-time-customer dashboards. */}
      {me && (() => {
        const steps = [
          { key: 'email',   label: 'Verify email',           done: !!me.emailVerified, href: '/dashboard/settings' },
          { key: 'kyc',     label: 'Complete KYC',           done: kycTier === 'T2' || kycTier === 'T3', href: '/dashboard/kyc' },
          { key: 'mfa',     label: 'Set up 2FA',             done: mfaEnrolled === true, href: '/dashboard/security' },
          { key: 'account', label: 'Request a virtual account', done: hasAccountRequest === true || hasAccounts, href: '/dashboard/accounts' },
          { key: 'fund',    label: 'Receive your first deposit', done: hasAccounts && (recent.length > 0), href: '/dashboard/wallet/receive' },
        ] as const
        const completed = steps.filter((s) => s.done).length
        const allDone = completed === steps.length
        if (allDone) return null
        // Find the next undone step to highlight as the primary CTA.
        const next = steps.find((s) => !s.done)
        return (
          <Card className="border-primary/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                {/* Progress ring */}
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                  <svg className="absolute inset-0" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                    <circle
                      cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3"
                      stroke="currentColor"
                      className="text-primary"
                      strokeDasharray={`${(completed / steps.length) * 100}, 100`}
                      strokeDashoffset="0"
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <span className="relative text-xs font-semibold">{completed}/{steps.length}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Continue setting up your account</p>
                  <p className="text-xs text-muted-foreground">
                    {next ? `Next: ${next.label}` : 'Almost there!'}
                  </p>
                </div>
                {next && (
                  <Button asChild size="sm">
                    <Link href={next.href}>Continue</Link>
                  </Button>
                )}
              </div>
              {/* Per-step list */}
              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {steps.map((s) => (
                  <div key={s.key} className={`rounded-md border px-2 py-1.5 text-[11px] flex items-center gap-1.5 ${s.done ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-muted/30'}`}>
                    {s.done ? <CheckCircle2 className="size-3 shrink-0" /> : <Circle className="size-3 shrink-0 opacity-50" />}
                    <span className="truncate">{s.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* KYC banner — hidden at T3.
          The four states it can show:
            - PENDING_REVIEW   → "Under review, expect an email within 24h" (no CTA)
            - REJECTED         → "Verification declined, please resubmit" (Resubmit CTA)
            - T0 + NOT_STARTED → "Verify your identity" (Start KYC CTA)
            - T1/T2 verified   → "Upgrade to next tier" (Continue CTA)
          The PENDING_REVIEW + REJECTED branches are new — previously the banner
          read solely off kycTier (which stays T0 until approved), so a customer
          who'd already submitted still saw "Verify your identity → Start KYC". */}
      {me && kycTier !== 'T3' && (() => {
        const kycStatus = me.kycStatus
        const isPending = kycStatus === 'PENDING_REVIEW'
        const isRejected = kycStatus === 'REJECTED'
        const tone = isPending
          ? 'border-sky-300/40 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20'
          : isRejected
            ? 'border-red-300/40 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20'
            : 'border-primary/20 bg-primary/5'
        const iconWrap = isPending
          ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
          : isRejected
            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
            : 'bg-primary/10 text-primary'
        const heading = isPending
          ? 'Verification under review'
          : isRejected
            ? 'Verification declined'
            : kycTier === 'T0'
              ? 'Verify your identity to start using FrenzPay'
              : `You’re ${KYC_LABEL[kycTier]} verified`
        const subtext = isPending
          ? 'We’ve received your documents — our team reviews every submission manually. You’ll get an email within 24 hours with the outcome.'
          : isRejected
            ? 'Your last submission needs a fresh attempt. Open KYC to see the reason and resubmit.'
            : kycTier === 'T0'
              ? 'Complete KYC to receive, send, save, and withdraw.'
              : `Upgrade to ${KYC_LABEL[KYC_TIERS[tierIndex + 1]!]} for higher limits.`
        const showCta = !isPending  // pending = nothing for the user to do
        const ctaLabel = isRejected
          ? 'View reason'
          : kycTier === 'T0'
            ? 'Start KYC'
            : 'Continue'
        return (
          <Card className={tone}>
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${iconWrap}`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{heading}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {isPending ? 'Pending review' : isRejected ? 'Action needed' : kycTier}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
                  {!isPending && !isRejected && (
                    <div className="mt-3 max-w-sm">
                      <Progress value={kycProgress} className="h-1.5" />
                    </div>
                  )}
                </div>
              </div>
              {showCta && (
                <Button asChild>
                  <Link href="/dashboard/kyc">{ctaLabel}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Balances */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Balances</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/wallet">View all</Link>
          </Button>
        </div>

        {accountsLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0,1,2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : !hasAccounts ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <WalletIcon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">Activate your wallet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Set up USD, NGN, and USDC accounts to start receiving, sending, and saving.
                </p>
              </div>
              {kycTier === 'T0' ? (
                me?.kycStatus === 'PENDING_REVIEW' ? (
                  <Badge variant="secondary" className="gap-1.5">Pending review · usually under 24h</Badge>
                ) : me?.kycStatus === 'REJECTED' ? (
                  <Button variant="destructive" asChild><Link href="/dashboard/kyc">Resubmit KYC</Link></Button>
                ) : (
                  <Button asChild><Link href="/dashboard/kyc">Complete KYC first</Link></Button>
                )
              ) : (
                <Button onClick={activateWallet} disabled={provisioning}>
                  {provisioning ? 'Activating...' : 'Activate wallet'}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {currencies.map(c => (
              <Card key={c} className={`overflow-hidden bg-gradient-to-br ${CURRENCY_GRADIENT[c]}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {c === 'USD' ? 'US Dollars' : c === 'NGN' ? 'Nigerian Naira' : 'USD Coin'}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px]">{c}</Badge>
                  </div>
                  <p className="mt-2 break-all text-2xl font-semibold tracking-tight">
                    {formatMinor(accounts!.available[c] ?? '0', c)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction icon={ArrowDownLeft} label="Receive"       sub="USD / Naira in"        href="/dashboard/wallet/receive?currency=USD" tone="emerald" />
          <QuickAction icon={Send}          label="Send"          sub="FrenzTag in seconds"   href="/dashboard/send"                         tone="sky" />
          <QuickAction icon={ArrowUpRight}  label="Withdraw"      sub="To any Naira bank"     href="/dashboard/withdraw"                     tone="red" />
          <QuickAction icon={ArrowLeftRight} label="Convert"       sub="USD ⇄ NGN ⇄ USDC" href="/dashboard/convert"                 tone="purple" />
          <QuickAction icon={PiggyBank}     label="Save"          sub="Flex, Target & Fixed"  href="/dashboard/savings"                      tone="pink" />
          <QuickAction icon={CreditCard}    label="Cards"         sub="Virtual USD cards"     href="/dashboard/cards"                        tone="indigo" />
          <QuickAction icon={ShieldCheck}   label="KYC"           sub={`Tier ${kycTier}`}     href="/dashboard/kyc"                          tone="amber" />
          <QuickAction icon={Sparkles}      label="Refer a friend" sub="Share & earn"          href="/dashboard/referrals"                    tone="fuchsia" />
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/activity">View all</Link>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {recentLoading ? (
              <div className="p-5 space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-xs text-muted-foreground">Once money starts moving, it shows up here.</p>
              </div>
            ) : (
              <div className="divide-y">
                {recent.map(tx => (
                  <Link
                    key={tx.id}
                    href="/dashboard/activity"
                    className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
                        (tx.direction === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : tx.direction === 'out' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        : 'bg-muted text-muted-foreground')
                      }>
                        {tx.direction === 'in' ? <ArrowDownLeft className="h-4 w-4" />
                         : tx.direction === 'out' ? <ArrowUpRight className="h-4 w-4" />
                         : <ArrowLeftRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium capitalize">
                          {tx.type.toLowerCase().replace(/_/g, ' ')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(tx.postedAt ?? tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className={
                      'font-mono text-sm font-medium whitespace-nowrap ' +
                      (tx.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400'
                      : tx.direction === 'out' ? 'text-red-600 dark:text-red-400'
                      : '')
                    }>
                      {tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : ''}
                      {formatMinor(tx.amount, (tx.currency as Currency) ?? 'USD')}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-500/20',
  sky:     'bg-sky-500/10 text-sky-700 dark:text-sky-400 group-hover:bg-sky-500/20',
  red:     'bg-red-500/10 text-red-700 dark:text-red-400 group-hover:bg-red-500/20',
  purple:  'bg-purple-500/10 text-purple-700 dark:text-purple-400 group-hover:bg-purple-500/20',
  pink:    'bg-pink-500/10 text-pink-700 dark:text-pink-400 group-hover:bg-pink-500/20',
  indigo:  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 group-hover:bg-indigo-500/20',
  amber:   'bg-amber-500/10 text-amber-700 dark:text-amber-400 group-hover:bg-amber-500/20',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 group-hover:bg-fuchsia-500/20',
}

function QuickAction({
  icon: Icon, label, sub, href, tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  sub: string
  href: string
  tone: string
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-all hover:border-primary/40 hover:shadow-sm">
        <CardContent className="p-4">
          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${TONES[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
