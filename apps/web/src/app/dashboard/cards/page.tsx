'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertCircle,
  CreditCard,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Snowflake,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useMe } from '@/hooks/use-me';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type CardStatus = 'ACTIVE' | 'FROZEN' | 'TERMINATED';

interface CardRow {
  id: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  status: CardStatus;
  dailyLimitCents: string | null;
  monthlyLimitCents: string | null;
  createdAt: string;
}

function formatExpiry(m: number, y: number) {
  return `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`;
}
function formatUsdCents(v: string | null) {
  if (!v) return 'No limit';
  const n = BigInt(v);
  const whole = n / 100n;
  const frac = (n % 100n).toString().padStart(2, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${frac}`;
}

function CardVisual({ card }: { card: CardRow }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 p-5 text-white shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.25),transparent_55%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-sm uppercase tracking-wide text-zinc-400">FrenzPay</span>
          <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/10">
            {card.brand}
          </Badge>
        </div>
        <div className="font-mono text-lg tracking-[0.3em]">•••• •••• •••• {card.last4}</div>
        <div className="flex items-end justify-between text-xs">
          <span className="font-mono text-zinc-400">VALID THRU {formatExpiry(card.expiryMonth, card.expiryYear)}</span>
          {card.status !== 'ACTIVE' && (
            <Badge
              variant="secondary"
              className={card.status === 'FROZEN' ? 'bg-sky-500/20 text-sky-200' : 'bg-red-500/20 text-red-200'}
            >
              {card.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CardsPage() {
  const { me, loading: meLoading } = useMe();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Issue dialog
  const [issueOpen, setIssueOpen] = useState(false);
  const [dailyLimitUsd, setDailyLimitUsd] = useState('500');
  const [monthlyLimitUsd, setMonthlyLimitUsd] = useState('5000');
  const [issuePin, setIssuePin] = useState('');
  const [issuing, setIssuing] = useState(false);

  // Terminate dialog
  const [terminateTarget, setTerminateTarget] = useState<CardRow | null>(null);
  const [terminatePin, setTerminatePin] = useState('');
  const [terminating, setTerminating] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cards', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load cards (${res.status})`);
      const json = await res.json();
      setCards(json.cards ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cards';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCards(); }, [fetchCards]);

  const handleIssue = useCallback(async () => {
    setIssuing(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: issuePin,
          dailyLimitCents: dailyLimitUsd ? String(BigInt(Math.round(parseFloat(dailyLimitUsd) * 100))) : undefined,
          monthlyLimitCents: monthlyLimitUsd ? String(BigInt(Math.round(parseFloat(monthlyLimitUsd) * 100))) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to issue card');
      toast.success(`${json.card.brand} card issued — •••• ${json.card.last4}`);
      setIssueOpen(false);
      setIssuePin('');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue card');
    } finally {
      setIssuing(false);
    }
  }, [issuePin, dailyLimitUsd, monthlyLimitUsd, fetchCards]);

  const handleFreezeToggle = useCallback(async (card: CardRow) => {
    const path = card.status === 'FROZEN' ? `/api/cards/${card.id}/unfreeze` : `/api/cards/${card.id}/freeze`;
    try {
      const res = await fetch(path, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Action failed');
      toast.success(card.status === 'FROZEN' ? 'Card unfrozen' : 'Card frozen');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  }, [fetchCards]);

  const handleTerminate = useCallback(async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    try {
      const res = await fetch(`/api/cards/${terminateTarget.id}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: terminatePin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Termination failed');
      toast.success(`Card •••• ${terminateTarget.last4} terminated`);
      setTerminateTarget(null);
      setTerminatePin('');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Termination failed');
    } finally {
      setTerminating(false);
    }
  }, [terminateTarget, terminatePin, fetchCards]);

  // ── KYC gate — cards require T2+ ─────────────────────────────────────
  const tier = me?.kycTier ?? 'T0';
  const tierGated = !meLoading && me && tier !== 'T2' && tier !== 'T3';

  if (tierGated) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Virtual Cards</h1>
          <p className="text-sm text-muted-foreground">
            Issue USD virtual cards for online purchases.
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="text-lg font-semibold">Advanced verification required</h2>
              <p className="text-sm text-muted-foreground">
                Issuing virtual cards needs <span className="font-medium text-foreground">T2 verification</span>. Takes about 2 minutes &mdash; ID + selfie &mdash; and you&apos;re ready to spend online.
              </p>
            </div>
            <Badge variant="secondary">You&apos;re currently {tier}</Badge>
            <Button asChild>
              <Link href="/dashboard/kyc">{tier === 'T0' ? 'Start verification' : 'Upgrade to T2'}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Virtual Cards</h1>
          <p className="text-sm text-muted-foreground">
            Issue USD virtual cards for online purchases. Requires Advanced KYC.
          </p>
        </div>
        <Button onClick={() => setIssueOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Issue new card
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void fetchCards()}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="aspect-[16/10] w-full rounded-xl" />
          <Skeleton className="aspect-[16/10] w-full rounded-xl" />
        </div>
      )}

      {!loading && cards.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CreditCard className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">No cards yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Issue a virtual USD card to pay online, subscribe to services, or share with family.
              </p>
            </div>
            <Button size="lg" onClick={() => setIssueOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Issue your first card
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && cards.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.id} className="overflow-hidden">
              <CardContent className="space-y-4 p-5">
                <CardVisual card={card} />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Daily limit</p>
                    <p className="font-medium">{formatUsdCents(card.dailyLimitCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Monthly limit</p>
                    <p className="font-medium">{formatUsdCents(card.monthlyLimitCents)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.status !== 'TERMINATED' && (
                    <Button size="sm" variant="outline" onClick={() => void handleFreezeToggle(card)}>
                      {card.status === 'FROZEN' ? (
                        <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Unfreeze</>
                      ) : (
                        <><Snowflake className="mr-1.5 h-3.5 w-3.5" /> Freeze</>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    disabled={card.status === 'TERMINATED'}
                    onClick={() => setTerminateTarget(card)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Terminate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={(o) => { setIssueOpen(o); if (!o) setIssuePin(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a new virtual card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="daily">Daily limit (USD)</Label>
              <Input id="daily" type="number" min="0" className="mt-1.5" value={dailyLimitUsd} onChange={(e) => setDailyLimitUsd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="monthly">Monthly limit (USD)</Label>
              <Input id="monthly" type="number" min="0" className="mt-1.5" value={monthlyLimitUsd} onChange={(e) => setMonthlyLimitUsd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                className="mt-1.5 text-center font-mono tracking-[0.4em]"
                maxLength={6}
                placeholder="••••••"
                value={issuePin}
                onChange={(e) => setIssuePin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" /> Required to issue a card.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button disabled={issuePin.length !== 6 || issuing} onClick={handleIssue}>
              {issuing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Issuing...</> : 'Issue card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate dialog */}
      <Dialog open={!!terminateTarget} onOpenChange={(o) => { if (!o) { setTerminateTarget(null); setTerminatePin(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-600" />
              Terminate card permanently?
            </DialogTitle>
          </DialogHeader>
          {terminateTarget && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>This cannot be undone.</AlertTitle>
                <AlertDescription>
                  Card •••• {terminateTarget.last4} will be permanently blocked.
                  Any pending authorizations will still clear.
                </AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="termpin">Transaction PIN</Label>
                <Input
                  id="termpin"
                  type="password"
                  inputMode="numeric"
                  className="mt-1.5 text-center font-mono tracking-[0.4em]"
                  maxLength={6}
                  placeholder="••••••"
                  value={terminatePin}
                  onChange={(e) => setTerminatePin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={terminatePin.length !== 6 || terminating}
              onClick={handleTerminate}
            >
              {terminating ? 'Terminating...' : 'Yes, terminate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
