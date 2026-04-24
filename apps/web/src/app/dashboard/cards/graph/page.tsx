'use client';

/**
 * /dashboard/cards/graph
 *
 * Graph-issued USD virtual debit cards. Separate from the existing
 * /dashboard/cards (Bridge) to keep each rail's rules in one place:
 *   - Issue: requires KYC T2+ and graphPersonId set (created on KYC approve).
 *   - Funding: from your USD balance, no minimum on our side (Graph has its own).
 *   - Withdraw: drain the card back to your balance.
 *   - Freeze / unfreeze: via PATCH status=active|inactive.
 *   - Close: irreversible DELETE.
 *
 * PAN / CVV reveal uses the server's decrypt proxy (GET ?decrypt=1) — the
 * plaintext never touches our DB.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Snowflake,
  Trash2,
  Unlock,
  Wallet,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMe } from '@/hooks/use-me';

interface GraphCard {
  id: string;
  externalCardId: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  brand: string;
  status: string;
  createdAt: string;
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function GraphCardsPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const tier = me?.kycTier ?? 'T0';
  const kycApproved = tier === 'T2' || tier === 'T3';

  const [cards, setCards] = useState<GraphCard[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Issue dialog
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueLabel, setIssueLabel] = useState('Primary card');
  const [issueAmountUsd, setIssueAmountUsd] = useState('10');
  const [issuing, setIssuing] = useState(false);

  // Fund / withdraw dialog
  const [fundOpen, setFundOpen] = useState(false);
  const [fundMode, setFundMode] = useState<'fund' | 'withdraw'>('fund');
  const [fundCard, setFundCard] = useState<GraphCard | null>(null);
  const [fundAmountUsd, setFundAmountUsd] = useState('');
  const [funding, setFunding] = useState(false);

  // Reveal dialog
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealCard, setRevealCard] = useState<GraphCard | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealData, setRevealData] = useState<{
    pan?: string;
    cvv?: string;
    expiry_month?: number;
    expiry_year?: number;
  } | null>(null);

  // Per-card busy state
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/cards/graph', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load');
      setCards(json.cards ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kycApproved) void fetchCards();
  }, [fetchCards, kycApproved]);

  async function issueCard() {
    const cents = Math.round(parseFloat(issueAmountUsd || '0') * 100);
    if (cents < 1000) {
      toast.error('Minimum funding is $10');
      return;
    }
    setIssuing(true);
    try {
      const res = await fetch('/api/cards/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: issueLabel, funding_amount: cents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Issue failed (${res.status})`);
      toast.success('Card is being provisioned — details appear once Graph confirms');
      setIssueOpen(false);
      setIssueAmountUsd('10');
      setIssueLabel('Primary card');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Issue failed');
    } finally {
      setIssuing(false);
    }
  }

  async function toggleFreeze(card: GraphCard) {
    const newStatus = card.status === 'FROZEN' ? 'active' : 'inactive';
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/cards/graph/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Action failed (${res.status})`);
      toast.success(newStatus === 'active' ? 'Card unfrozen' : 'Card frozen');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function closeCard(card: GraphCard) {
    if (!confirm(`Close card ending ${card.last4}? This is irreversible.`)) return;
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/cards/graph/${card.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Close failed (${res.status})`);
      toast.success('Card closed');
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Close failed');
    } finally {
      setBusyId(null);
    }
  }

  function openFund(card: GraphCard, mode: 'fund' | 'withdraw') {
    setFundCard(card);
    setFundMode(mode);
    setFundAmountUsd('');
    setFundOpen(true);
  }

  async function submitFund() {
    if (!fundCard) return;
    const cents = Math.round(parseFloat(fundAmountUsd || '0') * 100);
    if (cents <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setFunding(true);
    try {
      const path = fundMode === 'fund'
        ? `/api/cards/graph/${fundCard.id}/fund`
        : `/api/cards/graph/${fundCard.id}/withdraw`;
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: cents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Action failed');
      toast.success(fundMode === 'fund' ? 'Card funded' : 'Withdrawn to wallet');
      setFundOpen(false);
      await fetchCards();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setFunding(false);
    }
  }

  async function openReveal(card: GraphCard) {
    setRevealCard(card);
    setRevealData(null);
    setRevealOpen(true);
    setRevealLoading(true);
    try {
      const res = await fetch(`/api/cards/graph/${card.id}?decrypt=1`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Reveal failed (${res.status})`);
      const raw = json.card ?? {};
      setRevealData({
        pan: raw.pan ?? raw.rawResponse?.pan,
        cvv: raw.cvv ?? raw.rawResponse?.cvv,
        expiry_month: raw.expiry_month,
        expiry_year: raw.expiry_year,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reveal failed');
      setRevealOpen(false);
    } finally {
      setRevealLoading(false);
    }
  }

  // ── KYC gate ────────────────────────────────────────────────────────────
  if (meLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!kycApproved) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to overview
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Complete KYC first</h2>
              <p className="text-sm text-muted-foreground mt-1">Card issuance requires identity verification.</p>
            </div>
            <Link href="/dashboard/kyc">
              <Button>Start verification</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to overview
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Virtual USD cards
          </h1>
          <p className="text-sm text-muted-foreground">
            Spend your USD balance online with a Visa virtual card.
          </p>
        </div>
        <Button onClick={() => setIssueOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New card
        </Button>
      </div>

      {/* Card list */}
      {listLoading ? (
        <Card><CardContent className="py-8 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading cards…
        </CardContent></Card>
      ) : cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No cards yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first virtual USD card — it spins up in seconds.
              </p>
            </div>
            <Button onClick={() => setIssueOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((c) => {
            const pending = c.last4 === '----' || c.status === 'PENDING';
            const frozen = c.status === 'FROZEN';
            const closed = c.status === 'TERMINATED' || c.status === 'CLOSED';
            const busy = busyId === c.id;
            return (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {c.brand || 'Visa'}
                    </CardTitle>
                    <Badge
                      variant={closed ? 'secondary' : frozen ? 'outline' : 'default'}
                    >
                      {c.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg bg-gradient-to-br from-sky-600 to-indigo-700 p-4 text-white">
                    <p className="text-xs opacity-80 uppercase tracking-wider">Card number</p>
                    <p className="text-lg font-mono tracking-wider mt-1">
                      {pending ? '•••• •••• •••• ••••' : `•••• ${c.last4}`}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs opacity-90">
                      <div>
                        <p className="opacity-70">Expires</p>
                        <p className="font-mono">
                          {c.expiryMonth > 0
                            ? `${String(c.expiryMonth).padStart(2, '0')}/${String(c.expiryYear).slice(-2)}`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {pending && (
                    <p className="text-xs text-muted-foreground">
                      Graph is provisioning the PAN — full card details appear once the
                      webhook confirms (usually within a minute).
                    </p>
                  )}

                  {!closed && !pending && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReveal(c)}
                        disabled={busy || frozen}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Show details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openFund(c, 'fund')}
                        disabled={busy || frozen}
                      >
                        <Wallet className="h-3.5 w-3.5 mr-1" />
                        Fund
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openFund(c, 'withdraw')}
                        disabled={busy || frozen}
                      >
                        Withdraw
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleFreeze(c)}
                        disabled={busy}
                      >
                        {frozen ? (
                          <><Unlock className="h-3.5 w-3.5 mr-1" />Unfreeze</>
                        ) : (
                          <><Snowflake className="h-3.5 w-3.5 mr-1" />Freeze</>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => closeCard(c)}
                        disabled={busy}
                        className="col-span-2"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Close card
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a virtual card</DialogTitle>
            <DialogDescription>
              Fund now with USD from your balance. You can top up or drain later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={issueLabel}
                onChange={(e) => setIssueLabel(e.target.value)}
                placeholder="Groceries"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amt">Initial funding (USD, min $10)</Label>
              <Input
                id="amt"
                type="number"
                step="1"
                min="10"
                value={issueAmountUsd}
                onChange={(e) => setIssueAmountUsd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)} disabled={issuing}>Cancel</Button>
            <Button onClick={issueCard} disabled={issuing}>
              {issuing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund/withdraw dialog */}
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {fundMode === 'fund' ? 'Fund card' : 'Withdraw from card'}
            </DialogTitle>
            <DialogDescription>
              {fundMode === 'fund'
                ? 'Top up from your USD balance to the card.'
                : 'Move funds from the card back to your USD balance.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fund-amt">Amount (USD)</Label>
              <Input
                id="fund-amt"
                type="number"
                step="1"
                min="1"
                value={fundAmountUsd}
                onChange={(e) => setFundAmountUsd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundOpen(false)} disabled={funding}>Cancel</Button>
            <Button onClick={submitFund} disabled={funding}>
              {funding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal dialog */}
      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Card details</DialogTitle>
            <DialogDescription>
              These values are fetched live from Graph and never stored on our servers.
              Close this dialog as soon as you&apos;ve copied them.
            </DialogDescription>
          </DialogHeader>
          {revealLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : revealData ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                {revealData.pan && (
                  <>
                    <p className="text-xs text-muted-foreground">Card number</p>
                    <p className="font-mono text-lg tracking-wider">{revealData.pan}</p>
                  </>
                )}
                {revealData.cvv && (
                  <>
                    <p className="text-xs text-muted-foreground mt-2">CVV</p>
                    <p className="font-mono">{revealData.cvv}</p>
                  </>
                )}
                {revealData.expiry_month && revealData.expiry_year && (
                  <>
                    <p className="text-xs text-muted-foreground mt-2">Expiry</p>
                    <p className="font-mono">
                      {String(revealData.expiry_month).padStart(2, '0')}/{String(revealData.expiry_year).slice(-2)}
                    </p>
                  </>
                )}
              </div>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Don&apos;t screenshot or share these details. Anyone with them can charge the card.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No details available</p>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealOpen(false)}>
              <EyeOff className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
