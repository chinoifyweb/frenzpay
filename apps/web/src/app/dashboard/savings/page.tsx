'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, PiggyBank, Plus, Shield, Target, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Currency = 'USD' | 'USDC' | 'NGN';
type LockStatus = 'ACTIVE' | 'MATURED' | 'BROKEN_EARLY';

interface Lock_ {
  id: string;
  amountCents: string;
  currency: Currency;
  goalName: string | null;
  status: LockStatus;
  maturityAt: string;
  earlyBreakFeeBps: number;
  unlockedAt: string | null;
  createdAt: string;
}

function formatMinor(a: string, c: Currency): string {
  const n = BigInt(a);
  const dec = c === 'USDC' ? 6 : 2;
  const whole = n / 10n ** BigInt(dec);
  const frac = (n % 10n ** BigInt(dec)).toString().padStart(dec, '0');
  const g = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (c === 'USDC') return `${g}.${frac.replace(/0+$/, '') || '00'} USDC`;
  return `${c === 'USD' ? '$' : '\u20A6'}${g}.${frac}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}
function daysElapsed(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86400000));
}

export default function SavingsPage() {
  const [locks, setLocks] = useState<Lock_[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [duration, setDuration] = useState(90);
  const [goalName, setGoalName] = useState('');
  const [pin, setPin] = useState('');
  const [creating, setCreating] = useState(false);

  // Break dialog
  const [breakTarget, setBreakTarget] = useState<Lock_ | null>(null);
  const [breakPin, setBreakPin] = useState('');
  const [breaking, setBreaking] = useState(false);

  const fetchLocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/savings', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setLocks(json.locks ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchLocks(); }, [fetchLocks]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const decimals = currency === 'USDC' ? 6 : 2;
      const amountMinor = String(Math.round(parseFloat(amount) * 10 ** decimals));
      if (!amountMinor || BigInt(amountMinor) <= 0n) throw new Error('Invalid amount');

      const res = await fetch('/api/savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor, currency, durationDays: duration,
          goalName: goalName.trim() || undefined,
          pin,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to lock funds');
      toast.success('Savings locked successfully!');
      setCreateOpen(false);
      setAmount(''); setGoalName(''); setPin('');
      await fetchLocks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to lock');
    } finally { setCreating(false); }
  }, [amount, currency, duration, goalName, pin, fetchLocks]);

  const handleBreak = useCallback(async () => {
    if (!breakTarget) return;
    setBreaking(true);
    try {
      const res = await fetch(`/api/savings/${breakTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: breakPin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to unlock');
      toast.success(json.matured ? 'Funds returned to your wallet' : 'Lock broken early');
      setBreakTarget(null); setBreakPin('');
      await fetchLocks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally { setBreaking(false); }
  }, [breakTarget, breakPin, fetchLocks]);

  const activeLocks = locks.filter((l) => l.status === 'ACTIVE');
  const totalActive = activeLocks.reduce((acc, l) => {
    const key = l.currency;
    acc[key] = (acc[key] ?? 0n) + BigInt(l.amountCents);
    return acc;
  }, {} as Record<Currency, bigint>);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Savings</h1>
          <p className="text-sm text-muted-foreground">
            Lock funds for 30, 90, 180, or 365 days. Build your discipline — early break costs 2%.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Lock funds
        </Button>
      </div>

      {Object.keys(totalActive).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.entries(totalActive) as [Currency, bigint][]).map(([ccy, total]) => (
            <Card key={ccy}>
              <CardContent className="p-5">
                <p className="text-xs uppercase text-muted-foreground">Locked in {ccy}</p>
                <p className="mt-1 font-mono text-xl font-semibold">{formatMinor(total.toString(), ccy)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : locks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PiggyBank className="h-6 w-6" />
            </div>
            <p className="font-medium">No savings locks yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Lock funds to build savings discipline. Matured locks auto-unlock to your wallet.
            </p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Lock your first goal</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locks.map((l) => {
            const maturity = new Date(l.maturityAt);
            const created = new Date(l.createdAt);
            const now = new Date();
            const totalDays = daysBetween(created, maturity);
            const elapsed = Math.min(totalDays, daysElapsed(created, now));
            const pct = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 100;
            const daysLeft = daysBetween(now, maturity);
            const statusStyle =
              l.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
              : l.status === 'MATURED' ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400';

            return (
              <Card key={l.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{l.goalName ?? 'Savings lock'}</p>
                        <Badge variant="secondary" className={statusStyle}>{l.status}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-lg font-semibold">
                        {formatMinor(l.amountCents, l.currency)}
                      </p>
                    </div>
                    {l.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" onClick={() => setBreakTarget(l)}>
                        {daysLeft > 0 ? <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Break early</> : <>Unlock now</>}
                      </Button>
                    )}
                  </div>
                  {l.status === 'ACTIVE' && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{elapsed} / {totalDays} days</span>
                        <span>{daysLeft > 0 ? `${daysLeft} days to go` : 'Matured — click to unlock'}</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  )}
                  {l.status !== 'ACTIVE' && l.unlockedAt && (
                    <p className="text-xs text-muted-foreground">
                      Unlocked {new Date(l.unlockedAt).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lock funds for savings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v as Currency); }}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={String(duration)} onValueChange={(v) => { if (v) setDuration(parseInt(v, 10)); }}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="amt">Amount</Label>
              <Input id="amt" type="text" inputMode="decimal" placeholder="0.00" className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="goal">Goal name (optional)</Label>
              <Input id="goal" className="mt-1.5" placeholder="e.g. Holiday fund" value={goalName} onChange={(e) => setGoalName(e.target.value.slice(0, 80))} />
            </div>
            <div>
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin" type="password" inputMode="numeric"
                className="mt-1.5 text-center font-mono tracking-[0.4em]"
                maxLength={6} placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              />
            </div>
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Early break costs 2% of locked amount. Matured locks auto-release at midnight UTC.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={pin.length !== 6 || !amount || creating} onClick={handleCreate}>
              {creating ? 'Locking...' : 'Lock funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Break dialog */}
      <Dialog open={!!breakTarget} onOpenChange={(o) => { if (!o) { setBreakTarget(null); setBreakPin(''); } }}>
        <DialogContent>
          {breakTarget && (() => {
            const matured = new Date(breakTarget.maturityAt) <= new Date();
            const amountN = BigInt(breakTarget.amountCents);
            const fee = matured ? 0n : (amountN * BigInt(breakTarget.earlyBreakFeeBps)) / 10_000n;
            const net = amountN - fee;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{matured ? 'Unlock matured savings' : 'Break early?'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Locked</span><span className="font-mono">{formatMinor(amountN.toString(), breakTarget.currency)}</span></div>
                    {!matured && <div className="flex justify-between mt-1"><span className="text-muted-foreground">Early break fee (2%)</span><span className="font-mono text-red-600">-{formatMinor(fee.toString(), breakTarget.currency)}</span></div>}
                    <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>You receive</span><span className="font-mono">{formatMinor(net.toString(), breakTarget.currency)}</span></div>
                  </div>
                  <div>
                    <Label htmlFor="bp">Transaction PIN</Label>
                    <Input
                      id="bp" type="password" inputMode="numeric"
                      className="mt-1.5 text-center font-mono tracking-[0.4em]"
                      maxLength={6} placeholder="••••••"
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
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
