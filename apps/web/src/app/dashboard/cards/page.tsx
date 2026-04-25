'use client'

/**
 * /dashboard/cards
 *
 * Full virtual-card dashboard, styled to match Grey's reference design:
 *
 *   - Centered card visual showing balance + last4
 *   - Three circular action buttons under the card (Details, Add Money, Freeze)
 *   - "MANAGE CARD" right-rail with Withdraw funds, Card statement,
 *     Delete this card (red destructive)
 *   - Recent transactions table at the bottom
 *
 * The previous "Select card type" landing was removed — physical cards
 * aren't a thing yet, so showing them as a Coming-soon placeholder was
 * just visual noise. Customers land directly on their virtual card now.
 *
 * Multiple cards: if the customer has more than one, a thin selector at
 * the top lets them switch which card the detail panel shows.
 *
 * All actions hit the existing /api/cards/graph/* endpoints — same code
 * the (now-removed) /dashboard/cards/graph page used.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, Copy, CreditCard, Eye, EyeOff, FileText, Info, Loader2, Lock,
  Plus, RefreshCw, Snowflake, Sparkles, Trash2, Unlock, Wallet,
} from 'lucide-react'

import { useMe } from '@/hooks/use-me'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface GraphCard {
  id: string
  externalCardId: string
  last4: string
  expiryMonth: number
  expiryYear: number
  brand: string
  status: string
  createdAt: string
  // Optional balance — server may include it. We default to 0 if missing.
  balanceCents?: string
}

interface CardTxn {
  id: string
  date: string
  merchant: string
  amount: string  // formatted
  status: 'completed' | 'failed' | 'pending'
}

function fmtUsdFromCents(c: number | string): string {
  const n = typeof c === 'string' ? parseFloat(c) : c
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CardsPage() {
  const { me, loading: meLoading } = useMe()
  const tier = me?.kycTier ?? 'T0'
  const isVerified = tier === 'T2' || tier === 'T3'

  const [cards, setCards] = useState<GraphCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [recentTxns, setRecentTxns] = useState<CardTxn[]>([])

  // Dialog state — issue / fund / withdraw / reveal / delete confirm
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueLabel, setIssueLabel] = useState('Primary card')
  const [issueAmountUsd, setIssueAmountUsd] = useState('10')
  const [issuing, setIssuing] = useState(false)

  const [fundOpen, setFundOpen] = useState(false)
  const [fundMode, setFundMode] = useState<'fund' | 'withdraw'>('fund')
  const [fundAmountUsd, setFundAmountUsd] = useState('')
  // TOTP gate — same rule as /api/withdrawals: card fund / withdraw move
  // money and require an authenticator code. Email OTP is not enough.
  const [fundTotpCode, setFundTotpCode] = useState('')
  const [fundEnrollRequired, setFundEnrollRequired] = useState(false)
  const [funding, setFunding] = useState(false)

  const [revealOpen, setRevealOpen] = useState(false)
  const [revealLoading, setRevealLoading] = useState(false)
  const [revealData, setRevealData] = useState<{
    pan?: string; cvv?: string; expiry_month?: number; expiry_year?: number
  } | null>(null)
  const [showSensitive, setShowSensitive] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [busy, setBusy] = useState(false) // any per-card action

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId) ?? cards[0] ?? null,
    [cards, selectedCardId],
  )

  const fetchCards = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetch('/api/cards/graph', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load')
      setCards(json.cards ?? [])
      // Auto-select the first card if none selected yet
      if ((json.cards ?? []).length > 0 && !selectedCardId) {
        setSelectedCardId(json.cards[0].id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed')
    } finally { setListLoading(false) }
  }, [selectedCardId])

  useEffect(() => { if (isVerified) void fetchCards() }, [fetchCards, isVerified])

  // Pull last 10 card transactions for the bottom table.
  useEffect(() => {
    if (!selectedCard) { setRecentTxns([]); return }
    fetch(`/api/transactions?type=CARD_CAPTURE&limit=10`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const txns: CardTxn[] = (d?.transactions ?? []).slice(0, 10).map((t: { id: string; createdAt: string; metadata?: { merchant?: string }; amount: string; status: string }) => ({
          id: t.id,
          date: new Date(t.createdAt).toLocaleString(),
          merchant: t.metadata?.merchant ?? 'Card transaction',
          amount: fmtUsdFromCents(t.amount),
          status: t.status === 'POSTED' ? 'completed' : t.status === 'PENDING' ? 'pending' : 'failed',
        }))
        setRecentTxns(txns)
      })
      .catch(() => setRecentTxns([]))
  }, [selectedCard])

  // ── Handlers ────────────────────────────────────────────────────────────

  async function issueCard() {
    const cents = Math.round(parseFloat(issueAmountUsd || '0') * 100)
    if (cents < 1000) { toast.error('Minimum funding is $10'); return }
    setIssuing(true)
    try {
      const res = await fetch('/api/cards/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ label: issueLabel, funding_amount: cents }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Issue failed (${res.status})`)
      toast.success('Card is being provisioned — details appear once Graph confirms')
      setIssueOpen(false)
      setIssueAmountUsd('10')
      await fetchCards()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Issue failed')
    } finally { setIssuing(false) }
  }

  async function toggleFreeze() {
    if (!selectedCard) return
    const newStatus = selectedCard.status === 'FROZEN' ? 'active' : 'inactive'
    setBusy(true)
    try {
      const res = await fetch(`/api/cards/graph/${selectedCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Action failed')
      toast.success(newStatus === 'active' ? 'Card unfrozen' : 'Card frozen')
      await fetchCards()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally { setBusy(false) }
  }

  async function submitFund() {
    if (!selectedCard) return
    const cents = Math.round(parseFloat(fundAmountUsd || '0') * 100)
    if (cents <= 0) { toast.error('Enter a valid amount'); return }
    if (fundTotpCode.length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator app')
      return
    }
    setFunding(true)
    try {
      const path = fundMode === 'fund'
        ? `/api/cards/graph/${selectedCard.id}/fund`
        : `/api/cards/graph/${selectedCard.id}/withdraw`
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'X-Mfa-Token': fundTotpCode,
        },
        body: JSON.stringify({ amount: cents }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Server says "set up Google Authenticator first" — flag the
        // dialog state so the UI swaps in a clear enrol path instead
        // of confusing "wrong code" toasts.
        if (res.status === 403 && json.enrollRequired) {
          setFundEnrollRequired(true)
          throw new Error('Set up Google Authenticator before moving card funds.')
        }
        throw new Error(json.error ?? 'Action failed')
      }
      toast.success(fundMode === 'fund' ? 'Card funded' : 'Withdrawn to wallet')
      setFundOpen(false)
      setFundAmountUsd('')
      setFundTotpCode('')
      setFundEnrollRequired(false)
      await fetchCards()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
      // TOTP codes rotate every 30s; clear so the user types a fresh one.
      setFundTotpCode('')
    } finally { setFunding(false) }
  }

  async function loadReveal() {
    if (!selectedCard) return
    setRevealLoading(true)
    setRevealOpen(true)
    setShowSensitive(false)
    try {
      const res = await fetch(`/api/cards/graph/${selectedCard.id}?decrypt=1`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not reveal')
      setRevealData(json)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reveal failed')
      setRevealOpen(false)
    } finally { setRevealLoading(false) }
  }

  async function deleteCard() {
    if (!selectedCard) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/cards/graph/${selectedCard.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Close failed')
      toast.success('Card closed')
      setDeleteOpen(false)
      setSelectedCardId(null)
      await fetchCards()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Close failed')
    } finally { setDeleting(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (meLoading || listLoading) {
    return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-72 w-full" /><Skeleton className="h-32 w-full" /></div>
  }

  if (!isVerified) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="size-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Cards unlock after KYC</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Verify your identity first — we issue virtual debit cards once your KYC is approved.
              </p>
            </div>
            <Button asChild><Link href="/dashboard/kyc">Start KYC</Link></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Cards</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CreditCard className="size-7" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Get your first virtual card</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Spend your USD balance anywhere Visa or Mastercard is accepted. Fund the card from your wallet, freeze any time.
              </p>
            </div>
            <Button onClick={() => setIssueOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              Get virtual card
            </Button>
          </CardContent>
        </Card>
        {renderIssueDialog()}
      </div>
    )
  }

  // Has at least one card — show the Grey-style detail layout.
  if (!selectedCard) return null
  const balanceCents = parseFloat(selectedCard.balanceCents ?? '0')
  const isFrozen = selectedCard.status === 'FROZEN'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/dashboard"><ArrowLeft className="size-4 mr-1" />Cards</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {cards.length > 1 && (
            <Select value={selectedCard.id} onValueChange={setSelectedCardId}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.brand} •••• {c.last4}{c.status === 'FROZEN' ? ' (frozen)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => setIssueOpen(true)}>
            <Plus className="size-4 mr-1.5" />New card
          </Button>
          <Button size="icon" variant="ghost" onClick={fetchCards}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Main detail panel — Grey layout */}
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 md:grid-cols-2">
          {/* Left — card visual + circular actions */}
          <div className="flex flex-col items-center gap-6">
            <CardVisual card={selectedCard} balanceCents={balanceCents} />
            <div className="flex items-center gap-6">
              <CircleAction
                icon={<Info className="size-5" />}
                label="Details"
                onClick={() => void loadReveal()}
              />
              <CircleAction
                icon={<Plus className="size-5" />}
                label="Add Money"
                onClick={() => { setFundMode('fund'); setFundAmountUsd(''); setFundOpen(true) }}
              />
              <CircleAction
                icon={isFrozen ? <Unlock className="size-5" /> : <Snowflake className="size-5" />}
                label={isFrozen ? 'Unfreeze' : 'Freeze'}
                onClick={() => void toggleFreeze()}
                disabled={busy}
              />
            </div>
          </div>

          {/* Right — Manage Card panel */}
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Manage card</p>
            <ManageRow
              icon={<Wallet className="size-4" />}
              label="Withdraw funds"
              onClick={() => { setFundMode('withdraw'); setFundAmountUsd(''); setFundOpen(true) }}
            />
            <ManageRow
              icon={<FileText className="size-4" />}
              label="Card statement"
              onClick={() => toast.info('Statement export coming soon — for now, see the recent transactions table below.')}
            />
            <ManageRow
              icon={<Trash2 className="size-4" />}
              label="Delete this card"
              destructive
              onClick={() => setDeleteOpen(true)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/activity">See all</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {recentTxns.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No card transactions yet — they&rsquo;ll appear here as you spend.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTxns.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{t.date}</TableCell>
                      <TableCell className="text-sm">{t.merchant}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{t.amount}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 text-xs ${
                          t.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400'
                          : t.status === 'failed' ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                        }`}>
                          <span className={`size-1.5 rounded-full ${
                            t.status === 'completed' ? 'bg-emerald-500'
                            : t.status === 'failed' ? 'bg-red-500'
                            : 'bg-amber-500'
                          }`} />
                          {t.status === 'completed' ? 'Completed' : t.status === 'failed' ? 'Failed' : 'Pending'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {renderIssueDialog()}

      <Dialog
        open={fundOpen}
        onOpenChange={(o) => {
          setFundOpen(o)
          if (!o) { setFundTotpCode(''); setFundEnrollRequired(false) }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fundMode === 'fund' ? 'Add money to card' : 'Withdraw from card'}</DialogTitle>
            <DialogDescription>
              {fundMode === 'fund'
                ? 'Move USD from your wallet into the virtual card.'
                : 'Move USD from the virtual card back to your wallet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="amt">Amount (USD)</Label>
              <Input
                id="amt"
                type="number"
                min="0"
                step="1"
                value={fundAmountUsd}
                onChange={(e) => setFundAmountUsd(e.target.value)}
              />
            </div>

            {/* TOTP gate — same rule as withdrawals. Email OTP not
                accepted for money-moving card actions. */}
            {fundEnrollRequired ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Set up Google Authenticator first
                </p>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/90">
                  Card money-movement requires an authenticator-app code. Email OTP isn’t enough.
                </p>
                <Link
                  href="/dashboard/security"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 underline"
                >
                  Open Security to enrol
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="fund-totp" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Authenticator code
                </Label>
                <Input
                  id="fund-totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={fundTotpCode}
                  onChange={(e) => setFundTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono tracking-widest text-center"
                />
                <p className="text-[11px] text-muted-foreground">
                  Open Google Authenticator and copy the current 6-digit code for FrenzPay.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundOpen(false)} disabled={funding}>Cancel</Button>
            {!fundEnrollRequired && (
              <Button
                onClick={submitFund}
                disabled={funding || fundTotpCode.length !== 6 || !fundAmountUsd}
              >
                {funding && <Loader2 className="size-4 mr-2 animate-spin" />}
                {fundMode === 'fund' ? 'Add money' : 'Withdraw'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Card details</DialogTitle>
            <DialogDescription>
              Sensitive — these are decrypted on demand and never written to disk. Don&rsquo;t share them.
            </DialogDescription>
          </DialogHeader>
          {revealLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin mr-2" />Decrypting…
            </div>
          ) : !revealData ? (
            <Alert><AlertDescription>No data.</AlertDescription></Alert>
          ) : (
            <div className="space-y-3">
              <FieldRow label="Card number" value={revealData.pan ?? '—'} sensitive show={showSensitive} onCopy={() => navigator.clipboard.writeText(revealData.pan ?? '')} />
              <FieldRow label="CVV" value={revealData.cvv ?? '—'} sensitive show={showSensitive} onCopy={() => navigator.clipboard.writeText(revealData.cvv ?? '')} />
              <FieldRow label="Expiry" value={`${String(revealData.expiry_month).padStart(2, '0')}/${String(revealData.expiry_year).slice(-2)}`} />
              <Button variant="outline" size="sm" onClick={() => setShowSensitive((s) => !s)}>
                {showSensitive ? <EyeOff className="size-4 mr-1.5" /> : <Eye className="size-4 mr-1.5" />}
                {showSensitive ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this card?</DialogTitle>
            <DialogDescription>
              Closes the card permanently. Any unspent balance is returned to your USD wallet. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCard} disabled={deleting}>
              {deleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  // ── Inner helpers ──────────────────────────────────────────────────────

  function renderIssueDialog() {
    return (
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a virtual card</DialogTitle>
            <DialogDescription>
              We&rsquo;ll create a fresh card and fund it from your USD balance. Minimum $10.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={issueLabel} onChange={(e) => setIssueLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amt">Initial funding (USD, min $10)</Label>
              <Input
                id="amt"
                type="number"
                step="1"
                value={issueAmountUsd}
                onChange={(e) => setIssueAmountUsd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)} disabled={issuing}>Cancel</Button>
            <Button onClick={issueCard} disabled={issuing}>
              {issuing && <Loader2 className="size-4 mr-2 animate-spin" />}
              Issue card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
}

// ─────────────────────────────────────────────── presentational subcomponents

/** Inky black card with chip-pattern + balance — matches Grey's design. */
function CardVisual({ card, balanceCents }: { card: GraphCard; balanceCents: number }) {
  return (
    <div className="relative aspect-[1.586/1] w-[260px] overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4 text-white shadow-xl shadow-black/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.18),transparent_60%)]" />
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'radial-gradient(circle at 0 0, rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '8px 8px',
      }} />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          {/* FrenzPay mark */}
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-black text-[10px] font-bold">F</div>
          </div>
          {/* Brand mark — coloured circles for Mastercard/Visa */}
          <div className="flex items-center">
            <div className="size-5 rounded-full bg-red-500/90" />
            <div className="size-5 -ml-2 rounded-full bg-amber-400/90 mix-blend-multiply" />
          </div>
        </div>
        <div className="font-mono text-xs tracking-[0.32em] opacity-80">
          ••••&nbsp;••••&nbsp;••••&nbsp;{card.last4}
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-semibold tracking-tight">
            ${(balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {card.status === 'FROZEN' && (
            <Badge variant="secondary" className="bg-sky-500/20 text-sky-200 border-0">Frozen</Badge>
          )}
        </div>
      </div>
    </div>
  )
}

function CircleAction({
  icon, label, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 transition-opacity disabled:opacity-50"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm dark:bg-zinc-800 hover:bg-zinc-800">
        {icon}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  )
}

function ManageRow({
  icon, label, onClick, destructive,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted/40 ${
        destructive ? 'text-red-600 hover:text-red-700 dark:text-red-400' : ''
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={destructive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>{icon}</span>
        <span className="font-medium">{label}</span>
      </span>
      <span className="text-muted-foreground">›</span>
    </button>
  )
}

function FieldRow({
  label, value, sensitive, show, onCopy,
}: {
  label: string; value: string; sensitive?: boolean; show?: boolean; onCopy?: () => void
}) {
  const display = sensitive && !show ? value.replace(/[0-9]/g, '•') : value
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-mono text-sm">{display}</p>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" onClick={() => { onCopy(); toast.success('Copied') }}>
          <Copy className="size-4" />
        </Button>
      )}
    </div>
  )
}
