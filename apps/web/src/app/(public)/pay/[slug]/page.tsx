'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, CheckCircle2, CreditCard, Loader2, Lock, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Currency = 'USD' | 'NGN' | 'USDC';

interface PublicLink {
  slug: string;
  type: 'fixed' | 'open';
  fixedAmountMinor: string | null;
  minAmountMinor: string | null;
  maxAmountMinor: string | null;
  currency: Currency;
  description: string;
  recipient: { displayName: string; verified: boolean };
}

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

function displayToMinor(display: string, currency: Currency): string | null {
  const cleaned = display.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  const decimals = DECIMALS[currency];
  if (fracPart.length > decimals) return null;
  const padded = `${intPart}${fracPart.padEnd(decimals, '0')}`.replace(/^0+/, '') || '0';
  return padded;
}

export default function PayPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [link, setLink] = useState<PublicLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/payment-links/${slug}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Link not available');
          return;
        }
        setLink(json as PublicLink);
        if (json.type === 'fixed' && json.fixedAmountMinor) {
          setAmountDisplay(
            (Number(json.fixedAmountMinor) / 10 ** DECIMALS[json.currency as Currency]).toFixed(DECIMALS[json.currency as Currency]),
          );
        }
      } catch {
        setError('Failed to load payment link');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const amountMinor = link ? displayToMinor(amountDisplay, link.currency) : null;

  const amountValid = useMemo(() => {
    if (!link || !amountMinor) return false;
    const n = BigInt(amountMinor);
    if (n <= 0n) return false;
    if (link.type === 'fixed' && link.fixedAmountMinor && n !== BigInt(link.fixedAmountMinor)) return false;
    if (link.minAmountMinor && n < BigInt(link.minAmountMinor)) return false;
    if (link.maxAmountMinor && n > BigInt(link.maxAmountMinor)) return false;
    return true;
  }, [link, amountMinor]);

  const handleCheckout = useCallback(async () => {
    if (!link || !amountMinor || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/payment-links/public/${slug}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Checkout failed');
      // Redirect to Paystack-hosted checkout
      window.location.href = json.authorizationUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }, [link, amountMinor, email, slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CreditCard className="h-6 w-6" />
            </div>
            <p className="font-medium">{error ?? 'Link not available'}</p>
            <p className="text-sm text-muted-foreground">
              The payment link you followed is no longer valid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg">Pay {link.recipient.displayName}</CardTitle>
            <div className="mt-1 flex items-center justify-center gap-1">
              {link.recipient.verified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
              <p className="text-sm text-muted-foreground">{link.description}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="amount">Amount ({link.currency})</Label>
            <div className="relative mt-1.5">
              {link.currency !== 'USDC' && (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">
                  {SYMBOLS[link.currency]}
                </span>
              )}
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className={link.currency === 'USDC' ? 'pr-14' : 'pl-8'}
                value={amountDisplay}
                onChange={(e) => setAmountDisplay(e.target.value)}
                disabled={link.type === 'fixed'}
              />
              {link.currency === 'USDC' && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USDC</span>
              )}
            </div>
            {link.type === 'open' && (
              <p className="mt-1 text-xs text-muted-foreground">
                {link.minAmountMinor && `Min ${formatMinor(link.minAmountMinor, link.currency)}. `}
                {link.maxAmountMinor && `Max ${formatMinor(link.maxAmountMinor, link.currency)}.`}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="email">Your email</Label>
            <Input
              id="email"
              type="email"
              className="mt-1.5"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <p className="mt-1 text-xs text-muted-foreground">We&apos;ll send a receipt to this address.</p>
          </div>

          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Payment is processed securely by Paystack. FrenzPay never sees your card details.
            </AlertDescription>
          </Alert>

          <Button
            className="w-full"
            size="lg"
            disabled={!amountValid || !/^.+@.+\..+$/.test(email) || submitting}
            onClick={handleCheckout}
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting...</>
            ) : (
              <>Pay {amountMinor ? formatMinor(amountMinor, link.currency) : '—'}</>
            )}
          </Button>
        </CardContent>
      </Card>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Powered by FrenzPay
      </p>
    </div>
  );
}
