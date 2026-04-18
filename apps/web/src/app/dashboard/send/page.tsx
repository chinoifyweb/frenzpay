'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Send as SendIcon,
  Shield,
  User,
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

type Currency = 'USD' | 'NGN' | 'USDC';

interface LookupResult {
  found: boolean;
  tag?: string;
  isVerified?: boolean;
  displayName?: string;
  error?: string;
  self?: boolean;
}

interface AccountsResponse {
  available: Partial<Record<Currency, string>>;
}

interface SendSuccess {
  transactionId: string;
  status: string;
  p2pTransferId: string;
  recipient: { tag: string; displayName: string };
  amountMinor: string;
  currency: Currency;
}

type Step = 'recipient' | 'amount' | 'pin' | 'success';

// Smallest-unit helpers for all three currencies
const DECIMALS: Record<Currency, number> = { USD: 2, NGN: 2, USDC: 6 };
const SYMBOLS: Record<Currency, string> = { USD: '$', NGN: '\u20A6', USDC: '' };

function formatMinor(amount: string, currency: Currency): string {
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
  return `${SYMBOLS[currency]}${grouped}.${fraction}`;
}

/** Convert user display input (e.g. "12.50") to BigInt minor units as a string. */
function displayToMinor(display: string, currency: Currency): string | null {
  const cleaned = display.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  const decimals = DECIMALS[currency];
  if (fracPart.length > decimals) return null;
  const paddedFrac = fracPart.padEnd(decimals, '0');
  const combined = `${intPart}${paddedFrac}`.replace(/^0+/, '') || '0';
  return combined;
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function SendPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCurrency = (searchParams.get('currency') as Currency) ?? 'USD';

  const [step, setStep] = useState<Step>('recipient');
  const [tagInput, setTagInput] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [looking, setLooking] = useState(false);

  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [amountDisplay, setAmountDisplay] = useState('');
  const [note, setNote] = useState('');
  const [availableByCurrency, setAvailableByCurrency] = useState<Partial<Record<Currency, string>>>({});

  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SendSuccess | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Load balances on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounts', { cache: 'no-store' });
        if (res.ok) {
          const json = (await res.json()) as AccountsResponse;
          setAvailableByCurrency(json.available ?? {});
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Debounced FrenzTag lookup
  useEffect(() => {
    const tag = tagInput.toLowerCase().trim();
    if (!/^[a-z][a-z0-9]{5,7}$/.test(tag)) {
      setLookup(null);
      setLooking(false);
      return;
    }
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/frenz-tag/lookup?tag=${encodeURIComponent(tag)}`);
        const json = (await res.json()) as LookupResult;
        if (res.ok) {
          setLookup(json);
        } else {
          setLookup({ found: false, error: json.error ?? 'Not found', self: json.self });
        }
      } catch {
        setLookup({ found: false, error: 'Lookup failed' });
      } finally {
        setLooking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [tagInput]);

  const canProceedToAmount = lookup?.found === true && !lookup.self;

  const amountMinor = displayToMinor(amountDisplay, currency);
  const available = availableByCurrency[currency] ?? '0';
  let amountValid = false;
  let amountError: string | null = null;
  if (amountDisplay.trim()) {
    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      amountError = 'Enter a valid amount';
    } else if (BigInt(amountMinor) > BigInt(available)) {
      amountError = `Only ${formatMinor(available, currency)} available`;
    } else {
      amountValid = true;
    }
  }

  const handleContinueToAmount = useCallback(() => {
    if (!canProceedToAmount) return;
    setIdempotencyKey(uuidv4()); // fresh key per attempt
    setStep('amount');
  }, [canProceedToAmount]);

  const handleContinueToPin = useCallback(() => {
    if (!amountValid) return;
    setPin('');
    setError(null);
    setStep('pin');
  }, [amountValid]);

  const handleSubmit = useCallback(async () => {
    if (!lookup?.found || !amountMinor || !idempotencyKey) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/p2p/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientTag: lookup.tag,
          amountMinor,
          currency,
          pin,
          note: note.trim() || undefined,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Send failed (${res.status})`);
      }
      setSuccess(json as SendSuccess);
      setStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [lookup, amountMinor, idempotencyKey, currency, pin, note]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to wallet
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Send money</h1>
        <p className="text-sm text-muted-foreground">
          Send instantly to any FrenzPay user using their @FrenzTag.
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-2 text-xs">
        {(['recipient', 'amount', 'pin'] as Step[]).map((s, idx) => {
          const current = step === s;
          const completed =
            (step === 'amount' && s === 'recipient') ||
            (step === 'pin' && (s === 'recipient' || s === 'amount')) ||
            step === 'success';
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                  completed
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
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

      {/* ── Step: Recipient ─────────────────────────────────────────────── */}
      {step === 'recipient' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recipient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="frenz-tag">FrenzTag</Label>
              <div className="relative mt-1.5">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="frenz-tag"
                  type="text"
                  className="pl-9 font-mono lowercase"
                  placeholder="janedoe"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8))}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                6-8 characters, letters and numbers only.
              </p>
            </div>

            {looking && tagInput.length >= 6 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up @{tagInput}...
              </div>
            )}

            {lookup && !looking && lookup.found && !lookup.self && (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{lookup.displayName}</p>
                      {lookup.isVerified && (
                        <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label="Verified" />
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">@{lookup.tag}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                </CardContent>
              </Card>
            )}

            {lookup && !looking && (!lookup.found || lookup.self) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {lookup.self
                    ? 'You cannot send money to yourself.'
                    : lookup.error ?? `No user found with FrenzTag @${tagInput}.`}
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={!canProceedToAmount} onClick={handleContinueToAmount}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Amount ───────────────────────────────────────────────── */}
      {step === 'amount' && lookup && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-lg">Amount</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep('recipient')}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Edit recipient
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs uppercase text-muted-foreground">Sending to</p>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{lookup.displayName}</span>
                {lookup.isVerified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
                <span className="font-mono text-xs text-muted-foreground">@{lookup.tag}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v as Currency); }}>
                <SelectTrigger id="currency" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['USD', 'NGN', 'USDC'] as Currency[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — Available: {formatMinor(availableByCurrency[c] ?? '0', c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount">Amount</Label>
              <div className="relative mt-1.5">
                {currency !== 'USDC' && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">
                    {SYMBOLS[currency]}
                  </span>
                )}
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  className={currency === 'USDC' ? 'pr-14' : 'pl-8'}
                  placeholder="0.00"
                  value={amountDisplay}
                  onChange={(e) => setAmountDisplay(e.target.value)}
                  autoFocus
                />
                {currency === 'USDC' && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    USDC
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Available: {formatMinor(available, currency)}
              </p>
              {amountError && <p className="mt-1 text-xs text-destructive">{amountError}</p>}
            </div>

            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                type="text"
                className="mt-1.5"
                placeholder="What's this for?"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                maxLength={200}
              />
            </div>

            <Button className="w-full" disabled={!amountValid} onClick={handleContinueToPin}>
              Review &amp; confirm
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step: PIN ──────────────────────────────────────────────────── */}
      {step === 'pin' && lookup && amountMinor && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-lg">Confirm with PIN</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStep('amount')} disabled={submitting}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">To</span>
                <div className="text-right text-sm">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-medium">{lookup.displayName}</span>
                    {lookup.isVerified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">@{lookup.tag}</span>
                </div>
              </div>
              <div className="flex items-start justify-between gap-2 border-t pt-3">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-mono text-lg font-semibold">
                  {formatMinor(amountMinor, currency)}
                </span>
              </div>
              {note.trim() && (
                <div className="flex items-start justify-between gap-2 border-t pt-3">
                  <span className="text-sm text-muted-foreground">Note</span>
                  <span className="max-w-[60%] text-right text-sm">{note}</span>
                </div>
              )}
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
                Required to confirm every transfer.
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
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon className="mr-2 h-4 w-4" />
                  Send {formatMinor(amountMinor, currency)}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Success ─────────────────────────────────────────────── */}
      {step === 'success' && success && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Sent!</h2>
              <p className="text-sm text-muted-foreground">
                {formatMinor(success.amountMinor, success.currency)} to{' '}
                <span className="font-medium text-foreground">{success.recipient.displayName}</span>
              </p>
              <Badge variant="secondary" className="mt-2 font-mono text-xs">
                @{success.recipient.tag}
              </Badge>
            </div>
            <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => router.push('/dashboard/activity')}>
                View activity
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setStep('recipient');
                  setTagInput('');
                  setLookup(null);
                  setAmountDisplay('');
                  setNote('');
                  setPin('');
                  setSuccess(null);
                  setError(null);
                }}
              >
                Send another
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">Tx {success.transactionId.slice(0, 12)}…</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
