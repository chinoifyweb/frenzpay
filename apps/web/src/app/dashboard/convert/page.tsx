'use client'

/**
 * /dashboard/convert — Swap between the user's own balances.
 *
 * Flow: amount + currencies → live quote preview → PIN → success
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Shield,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMe } from '@/hooks/use-me'

type Currency = 'USD' | 'NGN' | 'USDC'

// USDC disabled in the API in Phase 6 — hide it in the UI too for honesty
const UI_CURRENCIES: Currency[] = ['USD', 'NGN']

const DECIMALS: Record<Currency, number> = { USD: 2, NGN: 2, USDC: 6 }
const SYMBOL: Record<Currency, string> = { USD: '$', NGN: '\u20A6', USDC: '' }

function formatMinor(amount: string | bigint, currency: Currency): string {
  const raw = typeof amount === 'bigint' ? amount.toString() : (amount ?? '0').replace(/[^0-9]/g, '') || '0'
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
  const paddedFrac = fracPart.padEnd(decimals, '0')
  const combined = `${intPart}${paddedFrac}`.replace(/^0+/, '') || '0'
  return combined
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface Quote {
  fromCurrency: Currency
  toCurrency: Currency
  sourceAmountMinor: string
  feeMinor: string
  destAmountMinor: string
  fxRateMicroAfterMarkup: string
  fxMarkupBps: number
}

interface AccountsResponse {
  available: Partial<Record<Currency, string>>
}

type Step = 'form' | 'pin' | 'success'

export default function ConvertPage() {
  const router = useRouter()
  const { me } = useMe()

  const [step, setStep] = useState<Step>('form')

  const [from, setFrom] = useState<Currency>('USD')
  const [to, setTo] = useState<Currency>('NGN')
  const [amountDisplay, setAmountDisplay] = useState('')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)

  const [available, setAvailable] = useState<Partial<Record<Currency, string>>>({})
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  // Load balances
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/accounts', { cache: 'no-store' })
        if (res.ok) {
          const json = (await res.json()) as AccountsResponse
          setAvailable(json.available ?? {})
        }
      } catch { /* silent */ }
    })()
  }, [])

  const sourceMinor = displayToMinor(amountDisplay, from)
  const availSource = available[from] ?? '0'
  const balanceError = sourceMinor && BigInt(sourceMinor) > BigInt(availSource)
    ? `Only ${formatMinor(availSource, from)} available`
    : null

  // Debounced quote fetch
  const quoteReq = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!sourceMinor || BigInt(sourceMinor) <= 0n || from === to) {
      setQuote(null)
      setQuoteError(null)
      setQuoting(false)
      return
    }
    if (balanceError) {
      setQuote(null)
      setQuoteError(balanceError)
      setQuoting(false)
      return
    }

    setQuoting(true)
    setQuoteError(null)
    quoteReq.current?.abort()
    const ctrl = new AbortController()
    quoteReq.current = ctrl

    const t = setTimeout(async () => {
      try {
        const url = `/api/convert/quote?from=${from}&to=${to}&amount=${sourceMinor}`
        const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
        const json = await res.json()
        if (!res.ok) {
          setQuote(null)
          setQuoteError(json.error ?? 'Quote failed')
        } else {
          setQuote(json as Quote)
          setQuoteError(null)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setQuote(null)
        setQuoteError('Quote failed')
      } finally {
        setQuoting(false)
      }
    }, 300)

    return () => { clearTimeout(t); ctrl.abort() }
  }, [from, to, sourceMinor, balanceError])

  const canContinue = !!quote && !balanceError && !quoteError && !quoting

  const handleContinue = useCallback(() => {
    if (!canContinue) return
    setIdempotencyKey(uuidv4())
    setPin('')
    setError(null)
    setStep('pin')
  }, [canContinue])

  const handleSubmit = useCallback(async () => {
    if (!quote || !idempotencyKey) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCurrency: quote.fromCurrency,
          toCurrency: quote.toCurrency,
          sourceAmountMinor: quote.sourceAmountMinor,
          pin,
          idempotencyKey,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Convert failed (${res.status})`)
      toast.success(`Converted ${formatMinor(quote.sourceAmountMinor, quote.fromCurrency)} → ${formatMinor(quote.destAmountMinor, quote.toCurrency)}`)
      setStep('success')
      // Refresh balances for next conversion
      try {
        const a = await fetch('/api/accounts', { cache: 'no-store' })
        if (a.ok) setAvailable(((await a.json()) as AccountsResponse).available ?? {})
      } catch { /* silent */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Conversion failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }, [quote, pin, idempotencyKey])

  const flipCurrencies = () => {
    setFrom(to)
    setTo(from)
    setAmountDisplay('')
    setQuote(null)
    setQuoteError(null)
  }

  const effectiveRate = quote
    ? ((Number(BigInt(quote.fxRateMicroAfterMarkup)) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 }))
    : null

  const kycTier = me?.kycTier ?? 'T0'

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back to overview
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Convert</h1>
        <p className="text-sm text-muted-foreground">
          Swap between your own balances. Rates are mid-market with a small spread.
        </p>
      </div>

      {kycTier === 'T0' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Complete KYC to convert between balances.</span>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/kyc">Verify me</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {step === 'form' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowLeftRight className="h-4 w-4" />
              Exchange
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* From */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">You pay</Label>
                <span className="text-xs text-muted-foreground">
                  Available: {formatMinor(availSource, from)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  {from !== 'USDC' && (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">
                      {SYMBOL[from]}
                    </span>
                  )}
                  <Input
                    type="text"
                    inputMode="decimal"
                    className={`h-12 border-0 bg-transparent px-8 text-xl font-semibold shadow-none focus-visible:ring-0 ${from === 'USDC' ? 'pr-14 pl-3' : ''}`}
                    placeholder="0.00"
                    value={amountDisplay}
                    onChange={(e) => setAmountDisplay(e.target.value)}
                    autoFocus
                    disabled={kycTier === 'T0'}
                  />
                </div>
                <Select value={from} onValueChange={(v) => {
                  const c = v as Currency
                  if (c === to) setTo(from)
                  setFrom(c)
                }}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UI_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {balanceError && <p className="text-xs text-destructive">{balanceError}</p>}
            </div>

            {/* Flip */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={flipCurrencies}
                aria-label="Swap currencies"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>

            {/* To */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">You receive</Label>
                <span className="text-xs text-muted-foreground">
                  Balance: {formatMinor(available[to] ?? '0', to)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 flex-1 items-center px-3 text-xl font-semibold">
                  {quoting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : quote ? (
                    formatMinor(quote.destAmountMinor, quote.toCurrency)
                  ) : (
                    <span className="text-muted-foreground">0.00</span>
                  )}
                </div>
                <Select value={to} onValueChange={(v) => {
                  const c = v as Currency
                  if (c === from) setFrom(to)
                  setTo(c)
                }}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UI_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quote summary */}
            {quote && !quoting && (
              <div className="space-y-1.5 rounded-lg border border-dashed px-4 py-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">
                    1 {from} = {effectiveRate} {to}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-mono">{formatMinor(quote.feeMinor, from)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Spread</span>
                  <span className="font-mono">{(quote.fxMarkupBps / 100).toFixed(2)}%</span>
                </div>
              </div>
            )}

            {quoteError && !balanceError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{quoteError}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={!canContinue || kycTier === 'T0'}
              onClick={handleContinue}
            >
              Continue
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Conversions are instant and cannot be reversed.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'pin' && quote && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-lg">Confirm with PIN</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep('form')} disabled={submitting}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-mono font-semibold">{formatMinor(quote.sourceAmountMinor, quote.fromCurrency)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMinor(quote.destAmountMinor, quote.toCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-xs">
                <span className="text-muted-foreground">Rate</span>
                <span className="font-mono">1 {quote.fromCurrency} = {effectiveRate} {quote.toCurrency}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-mono">{formatMinor(quote.feeMinor, quote.fromCurrency)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                className="mt-1.5 text-center font-mono text-lg tracking-[0.4em]"
                maxLength={6}
                placeholder="\u2022\u2022\u2022\u2022\u2022\u2022"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                autoFocus
                autoComplete="off"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Required to confirm every conversion.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={pin.length !== 6 || submitting} onClick={handleSubmit}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Converting...</>
              ) : (
                <>Confirm — {formatMinor(quote.destAmountMinor, quote.toCurrency)}</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'success' && quote && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Converted!</h2>
              <p className="text-sm text-muted-foreground">
                {formatMinor(quote.sourceAmountMinor, quote.fromCurrency)} → <span className="font-medium text-foreground">{formatMinor(quote.destAmountMinor, quote.toCurrency)}</span>
              </p>
              <Badge variant="secondary" className="mt-2 font-mono text-xs">
                1 {quote.fromCurrency} = {effectiveRate} {quote.toCurrency}
              </Badge>
            </div>
            <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/dashboard/activity')}>
                View activity
              </Button>
              <Button className="flex-1" onClick={() => {
                setStep('form')
                setAmountDisplay('')
                setQuote(null)
                setQuoteError(null)
                setPin('')
                setError(null)
              }}>
                Convert more
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
