'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  DollarSign,
  Undo2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

type TxType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'P2P'
  | 'FX'
  | 'FEE'
  | 'REFUND'
  | 'LOCK'
  | 'UNLOCK'
  | 'CARD_AUTH'
  | 'CARD_CAPTURE'
  | 'CARD_REVERSAL';

type TxStatus = 'PENDING' | 'POSTED' | 'FAILED' | 'REVERSED';
type TxDirection = 'in' | 'out' | 'internal';

interface Transaction {
  id: string;
  type: TxType;
  status: TxStatus;
  amount: string;
  currency: string;
  feeAmount: string;
  feeCurrency: string | null;
  externalRef: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  postedAt: string | null;
  direction: TxDirection;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface TransactionsResponse {
  transactions: Transaction[];
  pagination: Pagination;
}

const TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All types' },
  { value: 'DEPOSIT', label: 'Deposits' },
  { value: 'WITHDRAWAL', label: 'Withdrawals' },
  { value: 'P2P', label: 'P2P' },
  { value: 'FX', label: 'FX' },
  { value: 'REFUND', label: 'Refunds' },
];

const CURRENCY_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All currencies' },
  { value: 'USD', label: 'USD' },
  { value: 'NGN', label: 'NGN' },
  { value: 'USDC', label: 'USDC' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All status' },
  { value: 'POSTED', label: 'Completed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REVERSED', label: 'Reversed' },
];

const PAGE_LIMIT = 20;

function formatMinor(amount: string | null | undefined, currency: string): string {
  const raw = (amount ?? '0').trim();
  const isNegative = raw.startsWith('-');
  const digits = (isNegative ? raw.slice(1) : raw).replace(/[^0-9]/g, '') || '0';

  const upper = currency.toUpperCase();
  const decimals = upper === 'USDC' ? 6 : 2;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  let fraction = padded.slice(padded.length - decimals);
  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (upper === 'USDC') {
    fraction = fraction.replace(/0+$/, '');
    if (fraction.length < 2) fraction = fraction.padEnd(2, '0');
    return `${isNegative ? '-' : ''}${wholeGrouped}.${fraction} USDC`;
  }
  if (upper === 'USD') {
    return `${isNegative ? '-' : ''}$${wholeGrouped}.${fraction}`;
  }
  if (upper === 'NGN') {
    return `${isNegative ? '-' : ''}₦${wholeGrouped}.${fraction}`;
  }
  return `${isNegative ? '-' : ''}${wholeGrouped}.${fraction} ${upper}`;
}

function isZeroAmount(amount: string | null | undefined): boolean {
  if (!amount) return true;
  try {
    return BigInt(amount) === 0n;
  } catch {
    return true;
  }
}

const TYPE_META: Record<TxType, { label: string; Icon: typeof Circle; className: string }> = {
  DEPOSIT: { label: 'Deposit', Icon: ArrowDownLeft, className: 'text-emerald-600 dark:text-emerald-400' },
  WITHDRAWAL: { label: 'Withdrawal', Icon: ArrowUpRight, className: 'text-red-600 dark:text-red-400' },
  P2P: { label: 'P2P', Icon: ArrowLeftRight, className: 'text-sky-600 dark:text-sky-400' },
  FX: { label: 'FX', Icon: RefreshCw, className: 'text-purple-600 dark:text-purple-400' },
  FEE: { label: 'Fee', Icon: DollarSign, className: 'text-muted-foreground' },
  REFUND: { label: 'Refund', Icon: Undo2, className: 'text-orange-600 dark:text-orange-400' },
  LOCK: { label: 'Lock', Icon: Circle, className: 'text-muted-foreground' },
  UNLOCK: { label: 'Unlock', Icon: Circle, className: 'text-muted-foreground' },
  CARD_AUTH: { label: 'Card auth', Icon: Circle, className: 'text-muted-foreground' },
  CARD_CAPTURE: { label: 'Card capture', Icon: Circle, className: 'text-muted-foreground' },
  CARD_REVERSAL: { label: 'Card reversal', Icon: Circle, className: 'text-muted-foreground' },
};

function TypeCell({ type }: { type: TxType }) {
  const meta = TYPE_META[type] ?? { label: type, Icon: Circle, className: 'text-muted-foreground' };
  const { Icon } = meta;
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-muted ${meta.className}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium">{meta.label}</span>
    </div>
  );
}

function DirectionCell({ direction }: { direction: TxDirection }) {
  if (direction === 'in') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <ArrowDown className="h-4 w-4" />
        <span className="text-xs font-medium uppercase">In</span>
      </span>
    );
  }
  if (direction === 'out') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <ArrowUp className="h-4 w-4" />
        <span className="text-xs font-medium uppercase">Out</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <ArrowLeftRight className="h-4 w-4" />
      <span className="text-xs font-medium uppercase">Internal</span>
    </span>
  );
}

function StatusBadge({ status }: { status: TxStatus }) {
  const styles: Record<TxStatus, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-500/15 dark:text-yellow-400',
    POSTED: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400',
    FAILED: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400',
    REVERSED: 'bg-gray-200 text-gray-700 hover:bg-gray-200 dark:bg-gray-500/20 dark:text-gray-300',
  };
  return (
    <Badge variant="secondary" className={`${styles[status]} font-medium`}>
      {status}
    </Badge>
  );
}

function AmountCell({ tx }: { tx: Transaction }) {
  const sign = tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : '';
  const cls =
    tx.direction === 'in'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tx.direction === 'out'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="flex flex-col items-end">
      <span className={`font-mono text-sm font-medium ${cls}`}>
        {sign}
        {formatMinor(tx.amount, tx.currency)}
      </span>
      {tx.feeAmount && tx.feeCurrency && !isZeroAmount(tx.feeAmount) && (
        <span className="text-[11px] text-muted-foreground">
          Fee {formatMinor(tx.feeAmount, tx.feeCurrency)}
        </span>
      )}
    </div>
  );
}

function DateCell({ tx }: { tx: Transaction }) {
  const iso = tx.postedAt ?? tx.createdAt;
  let label = '-';
  let title = iso;
  try {
    const date = new Date(iso);
    label = formatDistanceToNow(date, { addSuffix: true });
    title = date.toLocaleString();
  } catch {
    // fall through
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm" title={title}>
        {label}
      </span>
      {tx.status === 'PENDING' && !tx.postedAt && (
        <span className="text-[11px] text-muted-foreground">not posted</span>
      )}
    </div>
  );
}

function ReferenceCell({ tx }: { tx: Transaction }) {
  if (tx.externalRef) {
    return (
      <span className="block max-w-[180px] truncate font-mono text-xs text-muted-foreground" title={tx.externalRef}>
        {tx.externalRef}
      </span>
    );
  }
  return (
    <span className="block max-w-[180px] truncate font-mono text-xs text-muted-foreground/70" title={tx.id}>
      {tx.id.slice(0, 8)}...
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function ActivityPage() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));
    if (typeFilter !== 'ALL') params.set('type', typeFilter);
    if (currencyFilter !== 'ALL') params.set('currency', currencyFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    return params.toString();
  }, [page, typeFilter, currencyFilter, statusFilter]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions?${queryString}`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load transactions (${res.status})`);
      const json = (await res.json()) as TransactionsResponse;
      setData({
        transactions: json.transactions ?? [],
        pagination: json.pagination ?? { page, limit: PAGE_LIMIT, total: 0, pages: 1 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transactions';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [queryString, page]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, currencyFilter, statusFilter]);

  const pagination = data?.pagination;
  const transactions = data?.transactions ?? [];
  const isEmpty = !loading && !error && transactions.length === 0;
  const canPrev = (pagination?.page ?? 1) > 1;
  const canNext = pagination !== undefined && pagination.page < pagination.pages;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Activity</h1>
          <p className="text-sm text-muted-foreground">
            All your transactions across currencies.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void fetchTransactions()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between md:gap-4">
          <CardTitle className="text-base font-medium">Transactions</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v); }}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currencyFilter} onValueChange={(v) => { if (v) setCurrencyFilter(v); }}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && !loading && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-4">
                  <span>{error}</span>
                  <Button size="sm" variant="outline" onClick={() => void fetchTransactions()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {isEmpty ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-medium">No transactions yet</p>
                <p className="text-sm text-muted-foreground">
                  Your activity will appear here as soon as money starts moving.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[100px]">Direction</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[200px]">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <SkeletonRows />
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell><DateCell tx={tx} /></TableCell>
                        <TableCell><TypeCell type={tx.type} /></TableCell>
                        <TableCell><DirectionCell direction={tx.direction} /></TableCell>
                        <TableCell className="text-right"><AmountCell tx={tx} /></TableCell>
                        <TableCell><StatusBadge status={tx.status} /></TableCell>
                        <TableCell><ReferenceCell tx={tx} /></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pagination && pagination.total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages} &middot;{' '}
            {pagination.total.toLocaleString()} transaction{pagination.total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
