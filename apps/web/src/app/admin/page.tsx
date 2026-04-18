'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CreditCard, DollarSign, PiggyBank, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Metrics {
  users: { total: number; active: number; kyced: number; pendingKyc: number };
  transactions: { today: number; thisMonth: number };
  cards: { active: number };
  savings: { activeLocks: number };
  queue: { pendingKyc: number; fraudFlags24h: number };
  revenueMtd: Array<{ name: string; currency: string; creditedMinor: string }>;
}

function formatMinor(minor: string, currency: string): string {
  const n = BigInt(minor);
  const decimals = currency === 'USDC' ? 6 : 2;
  const whole = n / 10n ** BigInt(decimals);
  const frac = (n % 10n ** BigInt(decimals)).toString().padStart(decimals, '0');
  const g = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (currency === 'USD') return `$${g}.${frac}`;
  if (currency === 'NGN') return `\u20A6${g}.${frac}`;
  return `${g}.${frac} ${currency}`;
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/metrics', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch { toast.error('Failed to load metrics'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview and operational queues.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Total users" value={data.users.total} sub={`${data.users.active} active`} />
        <Stat icon={ShieldCheck} label="KYC verified" value={data.users.kyced} sub={`${data.users.pendingKyc} pending`} />
        <Stat icon={TrendingUp} label="Tx today" value={data.transactions.today} sub={`${data.transactions.thisMonth.toLocaleString()} MTD`} />
        <Stat icon={CreditCard} label="Active cards" value={data.cards.active} />
        <Stat icon={PiggyBank} label="Active savings" value={data.savings.activeLocks} />
        <Stat icon={AlertTriangle} label="Fraud flags (24h)" value={data.queue.fraudFlags24h} />
        <Stat icon={ShieldCheck} label="KYC queue" value={data.queue.pendingKyc} />
        <Stat icon={DollarSign} label="Revenue MTD (USD)" value={
          formatMinor(
            data.revenueMtd.find((r) => r.name === 'fees_usd')?.creditedMinor ?? '0',
            'USD',
          )
        } />
      </div>

      {data.revenueMtd.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue this month</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.revenueMtd.map((r) => (
              <div key={r.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">{r.name}</Badge>
                  <span className="text-muted-foreground">{r.currency}</span>
                </div>
                <span className="font-mono font-medium">{formatMinor(r.creditedMinor, r.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
