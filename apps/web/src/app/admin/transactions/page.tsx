'use client';

/**
 * /admin/transactions
 *
 * Read-only view of every transaction on the platform. Transactions are
 * immutable financial records — no editing, no flagging, no "approve" (flow-
 * specific approvals like withdrawal review live on their own pages).
 *
 * Admins use this surface to:
 *   - Audit money movement across the platform
 *   - Look up a specific transaction by id / ref
 *   - Filter by status / type / currency / user
 *
 * To reverse a transaction, ops creates a new reversing Transaction via a
 * separate flow — this page never mutates.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { formatDateTime } from '@/lib/utils';

interface TxRow {
  id: string;
  type: string;
  status: string;
  amount: string; // BigInt string — smallest unit
  currency: string;
  feeAmount: string;
  feeCurrency: string | null;
  externalRef: string | null;
  idempotencyKey: string;
  createdAt: string;
  postedAt: string | null;
  initiator: { id: string; email: string; name: string } | null;
  counterparty: { id: string; email: string; name: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  POSTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REVERSED: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
};

// Every Transaction.amount is a smallest-unit BigInt (cents for USD/EUR/GBP,
// kobo for NGN). Format for display with a minor-unit divisor of 100.
function formatAmount(amountStr: string, currency: string): string {
  const amount = Number(amountStr) / 100;
  const symbol: Record<string, string> = {
    USD: '$',
    EUR: '\u20ac',
    GBP: '\u00a3',
    NGN: '\u20a6',
    USDC: 'USDC ',
    USDT: 'USDT ',
  };
  const sym = symbol[currency] ?? `${currency} `;
  return `${sym}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [currency, setCurrency] = useState('all');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (status !== 'all') params.set('status', status);
      if (type !== 'all') params.set('type', type);
      if (currency !== 'all') params.set('currency', currency);
      const res = await fetch(`/api/admin/transactions?${params}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
      setRows(json.transactions ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load transactions');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, type, currency]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Client-side search over the rows already fetched (email / id / ref)
  const visible = q
    ? rows.filter((r) => {
        const needle = q.toLowerCase();
        return (
          r.id.toLowerCase().includes(needle) ||
          r.externalRef?.toLowerCase().includes(needle) ||
          r.idempotencyKey.toLowerCase().includes(needle) ||
          r.initiator?.email.toLowerCase().includes(needle) ||
          r.initiator?.name.toLowerCase().includes(needle) ||
          r.counterparty?.email.toLowerCase().includes(needle)
        );
      })
    : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Every money movement on the platform. Read-only: to reverse a transaction,
          create a reversing entry via the ops flow.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between md:gap-4">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-[240px] pl-9"
                placeholder="Search id / ref / email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REVERSED">Reversed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="DEPOSIT">Deposit</SelectItem>
                <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                <SelectItem value="P2P">P2P</SelectItem>
                <SelectItem value="FX">FX</SelectItem>
                <SelectItem value="FEE">Fee</SelectItem>
                <SelectItem value="REFUND">Refund</SelectItem>
                <SelectItem value="LOCK">Savings Lock</SelectItem>
                <SelectItem value="UNLOCK">Savings Unlock</SelectItem>
              </SelectContent>
            </Select>

            <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ccy</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="NGN">NGN</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    No transactions match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {r.type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.initiator ? (
                        <>
                          <div className="font-medium">{r.initiator.name}</div>
                          <div className="text-xs text-muted-foreground">{r.initiator.email}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">system</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatAmount(r.amount, r.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.feeAmount !== '0'
                        ? formatAmount(r.feeAmount, r.feeCurrency ?? r.currency)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[r.status] ?? ''}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.externalRef ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.externalRef.length > 12 ? `${r.externalRef.slice(0, 10)}…` : r.externalRef}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
