'use client';


import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  DollarSign,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface VirtualAccount {
  id: string;
  externalAccountId: string;
  accountName: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  bankName: string | null;
  currency: string;
  status: string;
  createdAt: string;
}

interface VirtualAccountResponse {
  virtualAccount: VirtualAccount | null;
}

interface ProvisionResponse {
  virtualAccount?: {
    externalAccountId: string;
    accountName: string;
    routingNumber: string;
    accountNumber: string;
    bankName: string;
    currency: string;
  };
  created?: boolean;
  error?: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="break-all font-mono text-sm font-medium">{value}</p>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={onCopy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function ReceivePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currency = (searchParams.get('currency') ?? 'USD').toUpperCase();

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<VirtualAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts/usd', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = (await res.json()) as VirtualAccountResponse;
      setAccount(json.virtualAccount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load account';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currency === 'USD') void fetchAccount();
    else setLoading(false);
  }, [fetchAccount, currency]);

  const handleProvision = useCallback(async () => {
    setProvisioning(true);
    setBlockReason(null);
    try {
      const res = await fetch('/api/accounts/usd/provision', { method: 'POST' });
      const json = (await res.json()) as ProvisionResponse;

      if (!res.ok) {
        if (res.status === 403) {
          setBlockReason(json.error ?? 'KYC upgrade required.');
        }
        throw new Error(json.error ?? `Failed to provision (${res.status})`);
      }

      toast.success(
        json.created
          ? 'USD account created. You can now receive deposits!'
          : 'USD account ready.',
      );
      await fetchAccount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to provision account';
      if (!blockReason) toast.error(msg);
    } finally {
      setProvisioning(false);
    }
  }, [fetchAccount, blockReason]);

  // ── Non-USD currencies: placeholder ─────────────────────────────────────────
  if (currency !== 'USD') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to wallet
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Receive {currency}</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Coming soon</AlertTitle>
              <AlertDescription>
                {currency} receiving accounts are not available yet. We&apos;ll notify you when they launch.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/wallet')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to wallet
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Receive USD</h1>
        <p className="text-sm text-muted-foreground">
          Get a US bank account for receiving wires and ACH deposits from anywhere in the world.
        </p>
      </div>

      {error && !loading && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void fetchAccount()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      )}

      {blockReason && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Upgrade required</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3">
            <span>{blockReason}</span>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => router.push('/dashboard/kyc')}>
              Go to KYC
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !account && !blockReason && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Request USD bank account</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  One-time setup. Takes less than a minute.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Receive USD via ACH or wire from anywhere in the world</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Funds settle automatically to your USDC balance</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Share routing + account numbers with clients and employers</span>
              </li>
            </ul>
            <Button size="lg" className="w-full" onClick={() => void handleProvision()} disabled={provisioning}>
              {provisioning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Request USD account'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && account && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{account.bankName ?? 'USD Bank Account'}</CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Share these details to receive USD deposits.
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  {account.status === 'active' ? 'Active' : account.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.accountName && <CopyField label="Account holder" value={account.accountName} />}
              {account.accountNumber && <CopyField label="Account number" value={account.accountNumber} />}
              {account.routingNumber && <CopyField label="Routing number (ACH & wire)" value={account.routingNumber} />}
              {account.bankName && <CopyField label="Bank name" value={account.bankName} />}
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>How deposits work</AlertTitle>
            <AlertDescription className="mt-2 text-sm">
              When someone sends USD to this account via ACH or wire, it will be automatically
              converted to USDC and added to your balance. ACH typically settles in 1-2 business
              days; wires arrive same-day during banking hours.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => void fetchAccount()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Prefer crypto? */}
          <Card className="mt-4">
            <CardContent className="flex flex-col items-start justify-between gap-3 py-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium">Prefer crypto?</p>
                <p className="text-xs text-muted-foreground">
                  Get a dedicated USDC / USDT address on ERC20, TRC20, or Polygon.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/wallet/crypto')}
              >
                Get a crypto address
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Client components using useSearchParams() require a <Suspense> boundary
// so Next can skip prerender. This wrapper provides that boundary.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export default function ReceivePage() {
  return (
    <Suspense>
      <ReceivePageInner />
    </Suspense>
  );
}
