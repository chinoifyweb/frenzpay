'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Coins,
  Copy,
  DollarSign,
  Euro,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Wallet as WalletIcon,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useMe } from '@/hooks/use-me';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

type AccountSubtype =
  | 'AVAILABLE'
  | 'PENDING'
  | 'HOLD'
  | 'RESERVED'
  | 'LOCKED';

type Currency = 'USD' | 'NGN' | 'USDC';

interface Account {
  id: string;
  currency: Currency;
  subtype: AccountSubtype;
  balance: string;
}

interface AccountsResponse {
  accounts: Account[];
  byCurrency: Partial<Record<Currency, Account[]>>;
  available: Partial<Record<Currency, string>>;
}

const CURRENCIES: Currency[] = ['USD', 'NGN', 'USDC'];

const CURRENCY_META: Record<
  Currency,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
    gradient: string;
  }
> = {
  USD: {
    label: 'US Dollar',
    description: 'Receive payments from around the world',
    icon: <DollarSign className="h-5 w-5" />,
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
  },
  NGN: {
    label: 'Nigerian Naira',
    description: 'Local bank transfers and withdrawals',
    icon: <span className="text-lg font-semibold leading-none">&#8358;</span>,
    gradient: 'from-sky-500/10 via-sky-500/5 to-transparent',
  },
  USDC: {
    label: 'USD Coin',
    description: 'Stablecoin settlement and withdrawals',
    icon: <Coins className="h-5 w-5" />,
    gradient: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
  },
};

function formatMinor(amount: string | null | undefined, currency: Currency): string {
  const raw = (amount ?? '0').trim();
  const isNegative = raw.startsWith('-');
  const digits = (isNegative ? raw.slice(1) : raw).replace(/[^0-9]/g, '') || '0';

  const decimals = currency === 'USDC' ? 6 : 2;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  let fraction = padded.slice(padded.length - decimals);

  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (currency === 'USDC') {
    fraction = fraction.replace(/0+$/, '');
    if (fraction.length < 2) fraction = fraction.padEnd(2, '0');
    const body = fraction ? `${wholeGrouped}.${fraction}` : wholeGrouped;
    return `${isNegative ? '-' : ''}${body} USDC`;
  }

  const symbol = currency === 'USD' ? '$' : '\u20A6';
  return `${isNegative ? '-' : ''}${symbol}${wholeGrouped}.${fraction}`;
}

function isZero(amount: string | null | undefined): boolean {
  if (!amount) return true;
  try {
    return BigInt(amount) === 0n;
  } catch {
    return true;
  }
}

function BalanceSkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

interface BalanceCardProps {
  currency: Currency;
  available: string;
  breakdown: Account[];
  onAddFunds: () => void;
  onSend: () => void;
}

function BalanceCard({ currency, available, breakdown, onAddFunds, onSend }: BalanceCardProps) {
  const meta = CURRENCY_META[currency];
  const secondary = breakdown.filter((a) => a.subtype !== 'AVAILABLE' && !isZero(a.balance));

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${meta.gradient}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {currency}
            </Badge>
            <span className="text-sm text-muted-foreground">{meta.label}</span>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm">
            {meta.icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
          <p className="mt-1 break-all text-3xl font-semibold tracking-tight">
            {formatMinor(available, currency)}
          </p>
        </div>

        {secondary.length > 0 && (
          <div className="space-y-1 rounded-md border bg-background/60 p-3 text-xs">
            {secondary.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between text-muted-foreground">
                <span className="capitalize">{acc.subtype.toLowerCase()}</span>
                <span className="font-mono text-foreground">
                  {formatMinor(acc.balance, currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" variant="default" onClick={onAddFunds}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add funds
          </Button>
          <Button size="sm" className="flex-1" variant="outline" onClick={onSend}>
            <Send className="mr-1.5 h-4 w-4" />
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── External (virtual bank) account types ─────────────────────────────────

type ActivationCurrency = 'USD' | 'EUR';

interface ExternalAccount {
  id: string;
  provider: string;
  type: string;                       // 'virtual_account' | 'bridge_customer'
  currency: string;                   // settlement currency (may be USDC even on a USD rail)
  activationCurrency: string;         // what the user activated (USD / EUR)
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  status: string | null;
}

const ACTIVATION_META: Record<ActivationCurrency, {
  label: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}> = {
  USD: {
    label: 'US Dollar account',
    description: 'ACH + wire. Receive from anywhere in the world.',
    icon: <DollarSign className="h-5 w-5" />,
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
  },
  EUR: {
    label: 'Euro account',
    description: 'SEPA. Coming soon — currently unavailable.',
    icon: <Euro className="h-5 w-5" />,
    gradient: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
  },
};

/** Copy-to-clipboard button used inside the account details card. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono">{value}</p>
      </div>
      <Button size="icon-xs" variant="ghost" onClick={onCopy} aria-label={`Copy ${label}`}>
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function ActivationCard({
  currency,
  activated,
  account,
  onActivate,
  activating,
  disabled,
  disabledReason,
}: {
  currency: ActivationCurrency;
  activated: boolean;
  account?: ExternalAccount;
  onActivate: () => void;
  activating: boolean;
  disabled: boolean;
  disabledReason?: string;
}) {
  const meta = ACTIVATION_META[currency];
  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${meta.gradient}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">{currency}</Badge>
              <span className="text-sm font-medium">{meta.label}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm">
            {meta.icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activated && account ? (
          <>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Active
            </Badge>
            <div className="space-y-2">
              {account.bankName && <CopyField label="Bank" value={account.bankName} />}
              {account.accountName && <CopyField label="Account name" value={account.accountName} />}
              {account.accountNumber && <CopyField label="Account number" value={account.accountNumber} />}
              {account.routingNumber && <CopyField label="Routing number" value={account.routingNumber} />}
            </div>
          </>
        ) : disabled ? (
          <div className="space-y-2">
            <Badge variant="secondary">Coming soon</Badge>
            {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
          </div>
        ) : (
          <Button onClick={onActivate} disabled={activating} className="w-full">
            {activating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Activate {currency}</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const { me } = useMe();
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [external, setExternal] = useState<ExternalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [activatingCurrency, setActivatingCurrency] = useState<ActivationCurrency | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accRes, extRes] = await Promise.all([
        fetch('/api/accounts', { method: 'GET', cache: 'no-store' }),
        fetch('/api/accounts/external', { method: 'GET', cache: 'no-store' }),
      ]);
      if (!accRes.ok) throw new Error(`Failed to load accounts (${accRes.status})`);
      const json = (await accRes.json()) as AccountsResponse;
      setData({
        accounts: json.accounts ?? [],
        byCurrency: json.byCurrency ?? {},
        available: json.available ?? {},
      });
      if (extRes.ok) {
        const ext = (await extRes.json()) as { accounts: ExternalAccount[] };
        setExternal(ext.accounts ?? []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load accounts';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const activateCurrency = useCallback(async (currency: ActivationCurrency) => {
    setActivatingCurrency(currency);
    try {
      const res = await fetch('/api/accounts/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Activation failed (${res.status})`);
      toast.success(json.created ? `${currency} account activated` : `${currency} account ready`);
      await fetchAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Activation failed';
      toast.error(msg);
    } finally {
      setActivatingCurrency(null);
    }
  }, [fetchAccounts]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const handleProvision = useCallback(async () => {
    setProvisioning(true);
    try {
      const res = await fetch('/api/accounts/provision', { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to activate wallet (${res.status})`);
      toast.success('Wallet activated');
      await fetchAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to activate wallet';
      toast.error(message);
    } finally {
      setProvisioning(false);
    }
  }, [fetchAccounts]);

  const isEmpty = !loading && !error && data !== null && data.accounts.length === 0;

  const tier = me?.kycTier ?? 'T0';
  const kycApproved = tier === 'T2' || tier === 'T3';
  const usdExternal = external.find((a) => a.activationCurrency === 'USD' && a.type === 'virtual_account');
  const eurExternal = external.find((a) => a.activationCurrency === 'EUR' && a.type === 'virtual_account');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Activate a virtual account to receive payments, and track your balances.
          </p>
        </div>
        {!loading && !isEmpty && (
          <Button variant="ghost" size="sm" onClick={() => void fetchAccounts()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}
      </div>

      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void fetchAccounts()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Virtual accounts (currency picker + details) */}
      {!loading && (
        kycApproved ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Virtual accounts
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ActivationCard
                currency="USD"
                activated={!!usdExternal}
                account={usdExternal}
                onActivate={() => void activateCurrency('USD')}
                activating={activatingCurrency === 'USD'}
                disabled={false}
              />
              <ActivationCard
                currency="EUR"
                activated={!!eurExternal}
                account={eurExternal}
                onActivate={() => void activateCurrency('EUR')}
                activating={activatingCurrency === 'EUR'}
                disabled={true}
                disabledReason="EUR accounts will go live once our SEPA rail is connected."
              />
            </div>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="space-y-1 max-w-md">
                <h2 className="text-lg font-semibold">Verify your identity to receive money</h2>
                <p className="text-sm text-muted-foreground">
                  Once you&rsquo;re verified (usually under 24h) you&rsquo;ll be able to activate a USD or EUR virtual account and start receiving payments.
                </p>
              </div>
              <Button asChild>
                <Link href="/dashboard/kyc">Go to verification</Link>
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CURRENCIES.map((c) => (
            <BalanceSkeletonCard key={c} />
          ))}
        </div>
      )}

      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <WalletIcon className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Activate your wallet</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Set up USD, NGN, and USDC accounts to start receiving payments.
              </p>
            </div>
            <Button size="lg" onClick={() => void handleProvision()} disabled={provisioning}>
              {provisioning ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Activating...
                </>
              ) : (
                'Activate wallet'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !isEmpty && data && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Balances
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CURRENCIES.map((currency) => {
            const available = data.available[currency] ?? '0';
            const breakdown = data.byCurrency[currency] ?? [];
            return (
              <BalanceCard
                key={currency}
                currency={currency}
                available={available}
                breakdown={breakdown}
                onAddFunds={() => router.push(`/dashboard/wallet/receive?currency=${currency}`)}
                onSend={() => router.push(`/dashboard/send?currency=${currency}`)}
              />
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
