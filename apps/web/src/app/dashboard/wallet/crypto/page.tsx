'use client';

/**
 * /dashboard/wallet/crypto
 *
 * Per-user crypto deposit addresses (USDC / USDT on ERC20, TRC20, POL).
 * Each (currency, network) combination gets a unique address provisioned
 * lazily the first time the user requests it. We cache the address in
 * UserExternalAccount so subsequent loads are instant.
 *
 * Deposits to these addresses settle to the user's USD balance via Graph
 * webhook (account.credit → Phase E handler).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMe } from '@/hooks/use-me';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────

type Currency = 'USDC' | 'USDT';
type Network = 'ERC20' | 'TRC20' | 'POL';

interface Address {
  id: string;
  graphAddressId: string;
  address: string;
  currency: string;
  network: string | null;
  createdAt: string;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CryptoReceivePage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const tier = me?.kycTier ?? 'T0';
  const kycApproved = tier === 'T2' || tier === 'T3';

  const [currency, setCurrency] = useState<Currency>('USDC');
  const [network, setNetwork] = useState<Network>('TRC20');

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/deposit-addresses', { cache: 'no-store' });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) throw new Error(json.error ?? 'Could not load');
      setAddresses(json.addresses ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kycApproved) void fetchAddresses();
  }, [fetchAddresses, kycApproved]);

  async function provision() {
    setProvisioning(true);
    try {
      const res = await fetch('/api/deposit-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, network }),
      });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      toast.success(
        json.reused
          ? `Existing ${currency} ${network} address loaded`
          : `New ${currency} ${network} address provisioned`,
      );
      await fetchAddresses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setProvisioning(false);
    }
  }

  async function copyToClipboard(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      toast.success('Copied');
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Copy failed');
    }
  }

  // ── KYC gate ────────────────────────────────────────────────────────────
  if (meLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!kycApproved) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to wallet
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-lg font-semibold">Complete KYC first</h2>
              <p className="text-sm text-muted-foreground">
                Crypto deposit addresses are available after identity verification.
              </p>
            </div>
            <Link href="/dashboard/kyc">
              <Button>Start verification</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to wallet
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Receive crypto
        </h1>
        <p className="text-sm text-muted-foreground">
          Deposits auto-convert to your USD balance when they land.
        </p>
      </div>

      <Alert>
        <Zap className="h-4 w-4" />
        <AlertDescription>
          Only send the exact asset + network shown below. Cross-chain or wrong-asset sends
          are <strong>irrecoverable</strong>.
        </AlertDescription>
      </Alert>

      {/* Provision form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate an address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Asset</label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Network</label>
              <Select value={network} onValueChange={(v) => setNetwork(v as Network)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRC20">TRC20 (Tron) — low fees</SelectItem>
                  <SelectItem value="ERC20">ERC20 (Ethereum)</SelectItem>
                  <SelectItem value="POL">POL (Polygon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={provision} disabled={provisioning} className="w-full">
            {provisioning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Get {currency} on {network}
          </Button>
        </CardContent>
      </Card>

      {/* Address list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {listLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : addresses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No addresses provisioned yet. Pick an asset + network above.
            </p>
          ) : (
            addresses.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border bg-muted/30 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{a.currency}</Badge>
                  {a.network && (
                    <Badge variant="secondary" className="text-[10px]">{a.network}</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs break-all">
                    {a.address}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(a.address, a.id)}
                  >
                    {copied === a.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
