'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Calendar,
  Check,
  Coins,
  Lock,
  PiggyBank,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Unlock,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useMe } from '@/hooks/use-me'

// ─── Types ───────────────────────────────────────────────────────────────────

type Currency = 'USD' | 'NGN' | 'USDC'
type LockStatus = 'ACTIVE' | 'MATURED' | 'BROKEN_EARLY'

interface Lock {
  id: string
  amountCents: string
  currency: Currency
  goalName: string | null
  status: LockStatus
  maturityAt: string
  earlyBreakFeeBps: number
  unlockedAt: string | null
  createdAt: string
}

interface AccountsResponse {
  available: Partial<Record<Currency, string>>
}

// ─── Product shelf (UI-level, all map to the same /api/savings backend) ─────

interface SavingsProduct {
  id: 'flex' | 'target' | 'fixed'
  name: string
  tagline: string
  apr: number
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  accent: string
  durationOptions: Array<{ days: number; label: string }>
  defaultDuration: number
  earlyBreak: boolean
  breakFeeBps: number
  minAmountUsd: number
  description: string
  highlights: string[]
  requiresGoal: boolean
}

const PRODUCTS: SavingsProduct[] = [
  {
    id: 'flex',
    name: 'Flex',
    tagline: 'Earn while you wait.',
    apr: 8,
    icon: Zap,
    gradient: 'from-emerald-500 via-emerald-400 to-teal-400',
    accent: 'emerald',
    durationOptions: [{ days: 30, label: 'Review in 30 days' }],
    defaultDuration: 30,
    earlyBreak: true,
    breakFeeBps: 0, // Flex = no penalty for early withdrawal
    minAmountUsd: 1,
    description: 'Park idle cash and earn daily interest. Withdraw any time — no penalty.',
    highlights: [
      'Interest accrues daily',
      'Withdraw anytime (no fee)',
      'Same-day access',
    ],
    requiresGoal: false,
  },
  {
    id: 'target',
    name: 'Target',
    tagline: 'Save toward something.',
    apr: 10,
    icon: Target,
    gradient: 'from-sky-500 via-blue-500 to-indigo-500',
    accent: 'sky',
    durationOptions: [
      { days: 30,  label: '1 month' },
      { days: 90,  label: '3 months' },
      { days: 180, label: '6 months' },
      { days: 365, label: '1 year' },
    ],
    defaultDuration: 90,
    earlyBreak: true,
    breakFeeBps: 200,
    minAmountUsd: 5,
    description: 'Give your savings a name. Rent, laptop, flight, wedding, school fees — lock it, name it, reach it.',
    highlights: [
      'Name your goal',
      'Progress tracker',
      'Early break: 2% fee',
    ],
    requiresGoal: true,
  },
  {
    id: 'fixed',
    name: 'Fixed',
    tagline: 'Maximum interest. Guaranteed.',
    apr: 14,
    icon: Lock,
    gradient: 'from-pink-500 via-rose-500 to-orange-400',
    accent: 'pink',
    durationOptions: [
      { days: 90,  label: '3 months — 10% APR' },
      { days: 180, label: '6 months — 12% APR' },
      { days: 365, label: '1 year — 14% APR' },
    ],
    defaultDuration: 365,
    earlyBreak: false,
    breakFeeBps: 200,
    minAmountUsd: 50,
    description: 'Lock funds for a fixed term and earn the highest rates on the platform. No early withdrawals — if you need flexibility, pick Flex instead.',
    highlights: [
      'Top-tier rates',
      'Guaranteed payout at maturity',
      'Not for money you’ll need this month',
    ],
    requiresGoal: false,
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DECIMALS: Record<Currency, number> = { USD: 2, NGN: 2, USDC: 6 }
const SYMBOL: Record<Currency, string> = { USD: '$', NGN: '₦', USDC: '' }

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

function displayToMinor(display: string, currency: Currency): string | null {
  const cleaned = display.replace(/,/g, '').trim()
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null
  const [intPart = '0', fracPart = ''] = cleaned.split('.')
  const decimals = DECIMALS[currency]
  if (fracPart.length > decimals) return null
  const padded = `${intPart}${fracPart.padEnd(decimals, '0')}`.replace(/^0+/, '') || '0'
  return padded
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000))
}

function projectedInterest(principalMinor: bigint, aprPct: number, days: number): bigint {
  // Simple interest, prorated for the term
  // principal × (APR/100) × (days/365)
  const numerator = principalMinor * BigInt(Math.round(aprPct * 100)) * BigInt(days)
  const denominator = 10_000n * 365n
  return numerator / denominator
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SavingsPage() {
  const { me } = useMe()
  const [locks, setLocks] = useState<Lock[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState<Partial<Record<Currency, string>>>({})

  const [selectedProduct, setSelectedProduct] = useState<SavingsProduct | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [duration, setDuration] = useState(90)
  const [goalName, setGoalName] = useState('')
  const [pin, setPin] = useState('')
  const [creating, setCreating] = useState(false)

  const [breakTarget, setBreakTarget] = useState<Lock | null>(null)
  const [breakPin, setBreakPin] = useState('')
  const [breaking, setBreaking] = useState(false)

  const fetchLocks = useCallback(async () => {
    setLoading(true)
    try {
      const [locksRes, acctsRes] = await Promise.all([
        fetch('/api/savings', { cache: 'no-store' }),
        fetch('/api/accounts', { cache: 'no-store' }),
      ])
      const locksIsJson = (locksRes.headers.get('content-type') ?? '').includes('application/json')
      if (locksRes.ok && locksIsJson) {
        const j = (await locksRes.json().catch(() => null)) ?? {}
        setLocks((j.locks ?? []) as Lock[])
      }
      const acctsIsJson = (acctsRes.headers.get('content-type') ?? '').includes('application/json')
      if (acctsRes.ok && acctsIsJson) {
        const a = ((await acctsRes.json().catch(() => null)) ?? {}) as Partial<AccountsResponse>
        setAvailable(a.available ?? {})
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchLocks() }, [fetchLocks])

  const activeLocks = locks.filter(l => l.status === 'ACTIVE')
  const matured = locks.filter(l => l.status !== 'ACTIVE')

  const totalSavedByCurrency = useMemo(() => {
    const acc: Record<string, bigint> = {}
    for (const l of activeLocks) {
      acc[l.currency] = (acc[l.currency] ?? 0n) + BigInt(l.amountCents)
    }
    return acc
  }, [activeLocks])

  function openProduct(product: SavingsProduct) {
    setSelectedProduct(product)
    setAmount('')
    setGoalName('')
    setPin('')
    setCurrency('USD')
    setDuration(product.defaultDuration)
    setCreateOpen(true)
  }

  const amountMinor = useMemo(
    () => displayToMinor(amount, currency),
    [amount, currency],
  )

  const availableMinor = available[currency] ?? '0'
  const canCreate =
    !!selectedProduct &&
    !!amountMinor &&
    BigInt(amountMinor) > 0n &&
    BigInt(amountMinor) <= BigInt(availableMinor) &&
    pin.length === 6 &&
    (!selectedProduct.requiresGoal || goalName.trim().length >= 2)

  const projected = useMemo(() => {
    if (!amountMinor || !selectedProduct) return null
    return projectedInterest(BigInt(amountMinor), selectedProduct.apr, duration)
  }, [amountMinor, duration, selectedProduct])

  async function handleCreate() {
    if (!selectedProduct || !amountMinor) return
    setCreating(true)
    try {
      const res = await fetch('/api/savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor, currency, durationDays: duration, pin,
          goalName: selectedProduct.requiresGoal
            ? goalName.trim()
            : (goalName.trim() || `${selectedProduct.name} — ${duration}d`),
        }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Failed to start savings')
      toast.success(`${selectedProduct.name} savings started!`)
      setCreateOpen(false)
      await fetchLocks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally { setCreating(false) }
  }

  async function handleBreak() {
    if (!breakTarget) return
    setBreaking(true)
    try {
      const res = await fetch(`/api/savings/${breakTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: breakPin }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Failed to unlock')
      toast.success(json.matured ? 'Unlocked — funds are in your wallet.' : 'Broken early. Funds returned.')
      setBreakTarget(null); setBreakPin('')
      await fetchLocks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed')
    } finally { setBreaking(false) }
  }

  const kycTier = me?.kycTier ?? 'T0'

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-pink-500/5 to-purple-500/10 p-8 md:p-10">
        <div className="flex items-start gap-4">
          <div className="hidden md:flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <PiggyBank className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <Badge variant="secondary" className="mb-3 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="mr-1 h-3 w-3" />
              Up to 14% APR
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Your money should be working — not sitting.
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Lock away what you don&apos;t need today and let interest build. Pick the product that fits — stay liquid with Flex, build toward a goal with Target, or maximise with Fixed.
            </p>
            {Object.keys(totalSavedByCurrency).length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {(Object.entries(totalSavedByCurrency) as [Currency, bigint][]).map(([c, total]) => (
                  <Badge key={c} variant="outline" className="bg-background/50 backdrop-blur">
                    <Coins className="mr-1 h-3 w-3" />
                    Saved: {formatMinor(total.toString(), c)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {kycTier === 'T0' && (
        <Alert>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Complete KYC (T1) to start saving.</span>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/kyc">Verify me</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Product shelf */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Choose your savings style
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {PRODUCTS.map(p => {
            const Icon = p.icon
            return (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${p.gradient} p-[1px] hover:-translate-y-1 transition-all duration-200 shadow-sm hover:shadow-lg`}
              >
                <div className="relative flex h-full flex-col rounded-[15px] bg-background p-6">
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradient} text-white shadow-sm`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-bold tracking-tight">{p.name}</h3>
                    <span className="text-xs font-medium text-muted-foreground">{p.tagline}</span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold">{p.apr}%</span>
                    <span className="text-xs text-muted-foreground">APR</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground flex-1">{p.description}</p>
                  <ul className="mt-4 space-y-1.5">
                    {p.highlights.map(h => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5"
                    disabled={kycTier === 'T0'}
                    onClick={() => openProduct(p)}
                  >
                    {p.name === 'Fixed' ? 'Lock & earn' : p.name === 'Target' ? 'Set a goal' : 'Start saving'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Active savings list */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your savings
          </h2>
          {activeLocks.length > 0 && (
            <Badge variant="secondary">{activeLocks.length} active</Badge>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map(i => <Skeleton key={i} className="h-36 w-full" />)}
          </div>
        ) : activeLocks.length === 0 && matured.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-6 w-6" />
              </div>
              <p className="font-medium">Your first dollar saved is your easiest win.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Pick a product above. You can start with as little as $1 on Flex.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {activeLocks.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {activeLocks.map(l => (
                  <LockCard key={l.id} lock={l} onBreak={() => setBreakTarget(l)} />
                ))}
              </div>
            )}
            {matured.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase text-muted-foreground">History</p>
                <div className="space-y-2">
                  {matured.map(l => (
                    <div key={l.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <Unlock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{l.goalName ?? 'Savings'}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.status === 'MATURED' ? 'Matured' : 'Broken early'} &middot;{' '}
                            {l.unlockedAt ? new Date(l.unlockedAt).toLocaleDateString() : ''}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-sm">
                        {formatMinor(l.amountCents, l.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <selectedProduct.icon className="h-5 w-5" />
                  {selectedProduct.name} savings
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg bg-gradient-to-br from-muted to-muted/50 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase text-muted-foreground">Projected return</span>
                    <span className="text-xs text-muted-foreground">{duration} days @ {selectedProduct.apr}% APR</span>
                  </div>
                  <p className="mt-1 font-mono text-xl font-semibold">
                    {projected ? '+' + formatMinor(projected.toString(), currency) : `${SYMBOL[currency]}0.00`}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v as Currency) }}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD — ${formatMinor(available.USD ?? '0', 'USD').slice(1)}</SelectItem>
                        <SelectItem value="USDC">USDC — {formatMinor(available.USDC ?? '0', 'USDC')}</SelectItem>
                        <SelectItem value="NGN">NGN — ₦{formatMinor(available.NGN ?? '0', 'NGN').slice(1)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Duration</Label>
                    <Select value={String(duration)} onValueChange={(v) => { if (v) setDuration(parseInt(v, 10)) }}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {selectedProduct.durationOptions.map(o => (
                          <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="amt">Amount</Label>
                  <Input
                    id="amt"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="mt-1.5"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available: {formatMinor(availableMinor, currency)}
                  </p>
                </div>

                {selectedProduct.requiresGoal && (
                  <div>
                    <Label htmlFor="goal">Goal name</Label>
                    <Input
                      id="goal"
                      className="mt-1.5"
                      placeholder="e.g. Laptop, Rent, Emergency fund"
                      value={goalName}
                      onChange={(e) => setGoalName(e.target.value.slice(0, 60))}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="pin">Transaction PIN</Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    className="mt-1.5 text-center font-mono tracking-[0.4em]"
                    maxLength={6}
                    placeholder="••••••"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  />
                </div>

                <Alert>
                  <AlertDescription className="text-xs">
                    {selectedProduct.earlyBreak
                      ? (selectedProduct.breakFeeBps === 0
                          ? 'Withdraw anytime with no fee.'
                          : `Early withdrawal: ${selectedProduct.breakFeeBps / 100}% fee of locked amount.`)
                      : 'This product cannot be broken early. Only lock what you won’t need.'}
                  </AlertDescription>
                </Alert>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button disabled={!canCreate || creating} onClick={handleCreate}>
                  {creating ? 'Locking...' : 'Start saving'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Break dialog */}
      <Dialog open={!!breakTarget} onOpenChange={(o) => { if (!o) { setBreakTarget(null); setBreakPin('') } }}>
        <DialogContent>
          {breakTarget && (() => {
            const matured = new Date(breakTarget.maturityAt) <= new Date()
            const amountN = BigInt(breakTarget.amountCents)
            const fee = matured ? 0n : (amountN * BigInt(breakTarget.earlyBreakFeeBps)) / 10_000n
            const net = amountN - fee
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{matured ? 'Unlock matured savings' : 'Break early?'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Locked</span><span className="font-mono">{formatMinor(amountN.toString(), breakTarget.currency)}</span></div>
                    {!matured && fee > 0n && (
                      <div className="mt-1 flex justify-between">
                        <span className="text-muted-foreground">Early break fee ({breakTarget.earlyBreakFeeBps / 100}%)</span>
                        <span className="font-mono text-red-600">-{formatMinor(fee.toString(), breakTarget.currency)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                      <span>You receive</span>
                      <span className="font-mono">{formatMinor(net.toString(), breakTarget.currency)}</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="bp">Transaction PIN</Label>
                    <Input
                      id="bp"
                      type="password"
                      inputMode="numeric"
                      className="mt-1.5 text-center font-mono tracking-[0.4em]"
                      maxLength={6}
                      placeholder="••••••"
                      value={breakPin}
                      onChange={(e) => setBreakPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBreakTarget(null)}>Cancel</Button>
                  <Button disabled={breakPin.length !== 6 || breaking} onClick={handleBreak}>
                    {breaking ? 'Unlocking...' : (matured ? 'Unlock' : 'Break early')}
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Lock Card ───────────────────────────────────────────────────────────────

function LockCard({ lock, onBreak }: { lock: Lock; onBreak: () => void }) {
  const maturity = new Date(lock.maturityAt)
  const created = new Date(lock.createdAt)
  const now = new Date()
  const totalDays = daysBetween(created, maturity)
  const elapsed = Math.min(totalDays, daysBetween(created, now))
  const pct = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 100
  const daysLeft = daysBetween(now, maturity)

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">{lock.goalName ?? 'Savings lock'}</p>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold">
              {formatMinor(lock.amountCents, lock.currency)}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onBreak}>
            {daysLeft > 0 ? <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Break early</> : 'Unlock now'}
          </Button>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {elapsed}/{totalDays} days</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {daysLeft > 0 ? `${daysLeft} left` : 'Matured'}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-emerald-600" />
          Earning interest daily
        </div>
      </CardContent>
    </Card>
  )
}
