'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
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
const SYMBOL: Record<Currency, string> = { USD: '$', NGN: '\u20A6', USDC: '' }
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

      {/* KYC banner — hidden at T3 */}
      {me && kycTier !== 'T3' && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">
                    {kycTier === 'T0' ? 'Verify your identity to start using FrenzPay' : `You\u2019re ${KYC_LABEL[kycTier]} verified`}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">{kycTier}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kycTier === 'T0'
                    ? 'Complete KYC to receive, send, save, and withdraw.'
                    : `Upgrade to ${KYC_LABEL[KYC_TIERS[tierIndex + 1]!]} for higher limits.`}
                </p>
                <div className="mt-3 max-w-sm">
                  <Progress value={kycProgress} className="h-1.5" />
                </div>
              </div>
            </div>
            <Button asChild>
              <Link href="/dashboard/kyc">{kycTier === 'T0' ? 'Start KYC' : 'Continue'}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
                <Button asChild><Link href="/dashboard/kyc">Complete KYC first</Link></Button>
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
          <QuickAction icon={ArrowLeftRight} label="Convert"       sub="USD \u21c4 NGN \u21c4 USDC" href="/dashboard/convert"                 tone="purple" />
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
