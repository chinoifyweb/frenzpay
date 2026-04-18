'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Landmark,
  Loader2,
  Shield,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

type SourceCurrency = 'USD' | 'USDC';
type Step = 'destination' | 'amount' | 'pin' | 'success';

interface Bank {
  name: string;
  code: string;
  slug: string | null;
}

interface Resolution {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

interface Quote {
  source: { currency: SourceCurrency; amountMinor: string; feeMinor: string; netAmountMinor: string };
  destination: { currency: 'NGN'; amountMinor: string };
  rate: {
    midMicro: string;
    afterMarkupMicro: string;
    markupBps: number;
    displayMidRate: number;
    displayEffectiveRate: number;
  };
}

interface SuccessPayload {
  transactionId: string;
  withdrawalId: string;
  reference: string;
  sourceAmountMinor: string;
  destKobo: string;
}

interface AccountsResponse {
  available: Partial<Record<string, string>>;
}

const DECIMALS: Record<SourceCurrency | 'NGN', number> = { USD: 2, USDC: 6, NGN: 2 };

function formatMinor(amount: string, currency: SourceCurrency | 'NGN'): string {
  const raw = (amount ?? '0').replace(/[^0-9]/g, '') || '0';
  const decimals = DECIMALS[currency];
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  let fraction = padded.slice(padded.length - decimals);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (currency === 'USDC') {
    fraction = fraction.replace(/0+$/, '');
    if (fraction.length < 2) fraction = fraction.padEnd(2, '0');
    return `${grouped}.${fraction} USDC`;
  }
  if (currency === 'USD') return `$${grouped}.${fraction}`;
  return `\u20A6${grouped}.${fraction}`;
}

function displayToMinor(display: string, currency: SourceCurrency): string | null {
  const cleaned = display.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  const decimals = DECIMALS[currency];
  if (fracPart.length > decimals) return null;
  const padded = `${intPart}${fracPart.padEnd(decimals, '0')}`.replace(/^0+/, '') || '0';
  return padded;
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function WithdrawPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('destination');

  // Destination state
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [bankCode, setBankCode] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Amount state
  const [sourceCurrency, setSourceCurrency] = useState<SourceCurrency>('USD');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [available, setAvailable] = useState<Partial<Record<string, string>>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);

  // PIN + submit
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessPayload | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // ── Load banks + balances ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [banksRes, accountsRes] = await Promise.all([
          fetch('/api/banks/ng', { cache: 'no-store' }),
          fetch('/api/accounts', { cache: 'no-store' }),
        ]);
        if (banksRes.ok) {
          const b = await banksRes.json();
          setBanks((b.banks ?? []).sort((x: Bank, y: Bank) => x.name.localeCompare(y.name)));
        }
        if (accountsRes.ok) {
          const a = (await accountsRes.json()) as AccountsResponse;
          setAvailable(a.available ?? {});
        }
      } catch {
        toast.error('Failed to load initial data');
      } finally {
        setBanksLoading(false);
      }
    })();
  }, []);

  // ── Debounced account resolution ───────────────────────────────────────────
  useEffect(() => {
    setResolveError(null);
    setResolution(null);
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) return;

    setResolving(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/banks/resolve?bankCode=${bankCode}&accountNumber=${accountNumber}`,
          { cache: 'no-store' },
        );
        const json = await res.json();
        if (!res.ok) {
          setResolveError(json.error ?? 'Could not resolve account');
          setResolution(null);
        } else {
          setResolution(json as Resolution);
        }
      } catch {
        setResolveError('Resolution failed');
      } finally {
        setResolving(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [bankCode, accountNumber]);

  const canProceedToAmount = !!resolution && !!bankCode && /^\d{10}$/.test(accountNumber);

  // ── Quote refresh on amount/currency change ────────────────────────────────
  useEffect(() => {
    setQuote(null);
    const minor = displayToMinor(amountDisplay, sourceCurrency);
    if (!minor || BigInt(minor) <= 0n) return;

    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/withdrawals/ngn/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceCurrency, sourceAmountMinor: minor }),
        });
        const json = await res.json();
        if (res.ok) setQuote(json as Quote);
      } finally {
        setQuoting(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [amountDisplay, sourceCurrency]);

  const amountMinor = displayToMinor(amountDisplay, sourceCurrency);
  const availableMinor = available[sourceCurrency] ?? '0';
  const amountError = useMemo(() => {
    if (!amountDisplay.trim()) return null;
    if (!amountMinor || BigInt(amountMinor) <= 0n) return 'Enter a valid amount';
    if (BigInt(amountMinor) > BigInt(availableMinor)) return `Only ${formatMinor(availableMinor, sourceCurrency)} available`;
    return null;
  }, [amountDisplay, amountMinor, availableMinor, sourceCurrency]);

  const amountValid = !amountError && !!amountMinor && !!quote;

  const handleSubmit = useCallback(async () => {
    if (!resolution || !amountMinor || !idempotencyKey) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/withdrawals/ngn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCurrency,
          sourceAmountMinor: amountMinor,
          bankCode,
          accountNumber,
          accountName: resolution.accountName,
          pin,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Withdrawal failed (${res.status})`);
      setSuccess(json as SuccessPayload);
      setStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Withdrawal failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [resolution, amountMinor, idempotencyKey, sourceCurrency, bankCode, accountNumber, pin]);

  const bankName = banks.find((b) => b.code === bankCode)?.name ?? '';

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to wallet
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Withdraw to Nigerian bank</h1>
        <p className="text-sm text-muted-foreground">
          Convert USD or USDC to NGN and send to any Nigerian bank account.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {(['destination', 'amount', 'pin'] as Step[]).map((s, idx) => {
          const current = step === s;
          const completed =
            (step === 'amount' && s === 'destination') ||
            (step === 'pin' && (s === 'destination' || s === 'amount')) ||
            step === 'success';
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  completed ? 'bg-emerald-500 text-white' : current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className={`capitalize ${current ? 'font-medium' : 'text-muted-foreground'}`}>{s}</span>
              {idx < 2 && <span className="h-px w-8 bg-border" />}
            </div>
          );
        })}
      </div>

      {/* ── Destination step ────────────────────────────────────────────── */}
      {step === 'destination' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bank">Bank</Label>
              <Select value={bankCode} onValueChange={(v) => { if (v) setBankCode(v); }} disabled={banksLoading}>
                <SelectTrigger id="bank" className="mt-1.5">
                  <SelectValue placeholder={banksLoading ? 'Loading banks...' : 'Select bank'} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {banks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="accountNumber">Account number</Label>
              <Input
                id="accountNumber"
                type="text"
                inputMode="numeric"
                className="mt-1.5 font-mono tracking-wide"
                placeholder="10-digit NUBAN"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                maxLength={10}
                disabled={!bankCode}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the 10-digit account number (NUBAN format).
              </p>
            </div>

            {resolving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Resolving account...
              </div>
            )}

            {resolveError && !resolving && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resolveError}</AlertDescription>
              </Alert>
            )}

            {resolution && !resolving && (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{resolution.accountName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {bankName} &middot; {resolution.accountNumber}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                </CardContent>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={!canProceedToAmount}
              onClick={() => {
                setIdempotencyKey(uuidv4());
                setStep('amount');
              }}
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Amount step ────────────────────────────────────────────────── */}
      {step === 'amount' && resolution && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg">Amount</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep('destination')}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs uppercase text-muted-foreground">To</p>
              <p className="font-medium">{resolution.accountName}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {bankName} &middot; {resolution.accountNumber}
              </p>
            </div>

            <div>
              <Label>Debit from</Label>
              <Select value={sourceCurrency} onValueChange={(v) => { if (v) setSourceCurrency(v as SourceCurrency); }}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['USD', 'USDC'] as SourceCurrency[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — Available: {formatMinor(available[c] ?? '0', c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amt">Amount ({sourceCurrency})</Label>
              <div className="relative mt-1.5">
                {sourceCurrency === 'USD' && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">$</span>
                )}
                <Input
                  id="amt"
                  type="text"
                  inputMode="decimal"
                  className={sourceCurrency === 'USD' ? 'pl-8' : 'pr-14'}
                  placeholder="0.00"
                  value={amountDisplay}
                  onChange={(e) => setAmountDisplay(e.target.value)}
                  autoFocus
                />
                {sourceCurrency === 'USDC' && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USDC</span>
                )}
              </div>
              {amountError && <p className="mt-1 text-xs text-destructive">{amountError}</p>}
            </div>

            {quote && !quoting && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">
                    1 {sourceCurrency} = {quote.rate.displayEffectiveRate.toFixed(2)} NGN
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-mono">{formatMinor(quote.source.feeMinor, sourceCurrency)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <span>Recipient gets</span>
                  <span className="font-mono">{formatMinor(quote.destination.amountMinor, 'NGN')}</span>
                </div>
              </div>
            )}
            {quoting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting quote...
              </div>
            )}

            <Button className="w-full" disabled={!amountValid} onClick={() => setStep('pin')}>
              Review &amp; confirm
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── PIN step ───────────────────────────────────────────────────── */}
      {step === 'pin' && resolution && amountMinor && quote && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg">Confirm withdrawal</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep('amount')} disabled={submitting}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">To</span>
                <div className="text-right">
                  <p className="font-medium">{resolution.accountName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {bankName} &middot; {resolution.accountNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground">You send</span>
                <span className="font-mono font-medium">{formatMinor(amountMinor, sourceCurrency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-mono">{formatMinor(quote.source.feeMinor, sourceCurrency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rate</span>
                <span className="font-mono">
                  1 {sourceCurrency} = {quote.rate.displayEffectiveRate.toFixed(2)} NGN
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
                <span>Recipient gets</span>
                <span className="font-mono">{formatMinor(quote.destination.amountMinor, 'NGN')}</span>
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
                placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                autoFocus
                autoComplete="off"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Required to confirm every payout.
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Building2 className="mr-2 h-4 w-4" />
                  Withdraw {formatMinor(quote.destination.amountMinor, 'NGN')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Success ────────────────────────────────────────────────────── */}
      {step === 'success' && success && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <BadgeCheck className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Withdrawal initiated</h2>
              <p className="text-sm text-muted-foreground">
                {formatMinor(success.destKobo, 'NGN')} will arrive in the recipient&apos;s account shortly.
              </p>
              <Badge variant="secondary" className="mt-2 font-mono text-xs">
                {success.reference}
              </Badge>
            </div>
            <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/dashboard/activity')}>
                View activity
              </Button>
              <Button className="flex-1" onClick={() => router.push('/dashboard/wallet')}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
