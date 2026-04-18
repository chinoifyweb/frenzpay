'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Eye, Link2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Currency = 'USD' | 'NGN' | 'USDC';
type LinkStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'CANCELLED';

interface LinkRow {
  id: string;
  slug: string;
  type: 'fixed' | 'open';
  fixedAmountCents: string | null;
  minAmountCents: string | null;
  maxAmountCents: string | null;
  currency: Currency;
  description: string | null;
  status: LinkStatus;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

function formatMinor(amount: string | null, currency: Currency): string {
  if (!amount) return '—';
  const n = BigInt(amount);
  const decimals = currency === 'USDC' ? 6 : 2;
  const whole = n / 10n ** BigInt(decimals);
  const frac = (n % 10n ** BigInt(decimals)).toString().padStart(decimals, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (currency === 'USDC') return `${grouped}.${frac.replace(/0+$/, '') || '00'} USDC`;
  return `${currency === 'USD' ? '$' : '\u20A6'}${grouped}.${frac}`;
}

export default function PaymentLinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [type, setType] = useState<'fixed' | 'open'>('fixed');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payment-links', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setLinks(json.links ?? []);
    } catch {
      toast.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLinks(); }, [fetchLinks]);

  const resetForm = () => {
    setType('fixed'); setCurrency('USD'); setAmount('');
    setMinAmount(''); setMaxAmount(''); setDescription('');
  };

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const decimals = currency === 'USDC' ? 6 : 2;
      const toMinor = (v: string) => {
        if (!v) return undefined;
        const num = Math.round(parseFloat(v) * 10 ** decimals);
        if (!Number.isFinite(num) || num <= 0) return undefined;
        return String(num);
      };
      const res = await fetch('/api/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, currency, description,
          fixedAmountMinor: type === 'fixed' ? toMinor(amount) : undefined,
          minAmountMinor: type === 'open' ? toMinor(minAmount) : undefined,
          maxAmountMinor: type === 'open' ? toMinor(maxAmount) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create link');
      toast.success('Payment link created');
      setCreateOpen(false);
      resetForm();
      await fetchLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  }, [type, currency, amount, minAmount, maxAmount, description, fetchLinks]);

  const copyLink = async (slug: string) => {
    const url = `${window.location.origin}/pay/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      toast.success('Link copied');
      setTimeout(() => setCopiedSlug(null), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const cancelLink = async (slug: string) => {
    try {
      const res = await fetch(`/api/payment-links/${slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Link cancelled');
      await fetchLinks();
    } catch {
      toast.error('Failed to cancel');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Payment links</h1>
          <p className="text-sm text-muted-foreground">
            Share a link to receive payments from anyone, no account needed.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New link
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : links.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Link2 className="h-6 w-6" />
            </div>
            <p className="font-medium">No payment links yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a link to accept one-off payments via card or bank transfer.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((l) => {
            const statusStyle =
              l.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
              : l.status === 'COMPLETED' ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400'
              : l.status === 'EXPIRED' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400'
              : 'bg-muted text-muted-foreground';
            return (
              <Card key={l.id}>
                <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{l.description ?? 'Payment link'}</p>
                      <Badge variant="secondary" className={statusStyle}>{l.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="font-mono">
                        {l.type === 'fixed' ? formatMinor(l.fixedAmountCents, l.currency) : `${l.currency} open amount`}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Eye className="h-3 w-3" /> {l.viewCount} view{l.viewCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      /pay/{l.slug}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copyLink(l.slug)}>
                      {copiedSlug === l.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    {l.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => void cancelLink(l.slug)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New payment link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => { if (v) setType(v as 'fixed' | 'open'); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                  <SelectItem value="open">Open amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v as Currency); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="NGN">NGN</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'fixed' ? (
              <div>
                <Label htmlFor="amt">Amount</Label>
                <Input id="amt" type="text" inputMode="decimal" placeholder="0.00" className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="mn">Min amount</Label>
                  <Input id="mn" type="text" inputMode="decimal" placeholder="0.00" className="mt-1.5" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="mx">Max amount</Label>
                  <Input id="mx" type="text" inputMode="decimal" placeholder="0.00" className="mt-1.5" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" className="mt-1.5" placeholder="What's this for?" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={creating || !description.trim()} onClick={handleCreate}>
              {creating ? 'Creating...' : 'Create link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
