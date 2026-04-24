'use client';

/**
 * /admin/withdrawals
 *
 * NGN withdrawal review queue (Graph rail only).
 *
 * Shows real data from /api/admin/withdrawals. Admin can:
 *   - Approve a PENDING request → moves to PROCESSING
 *   - Reject a PENDING request (with reason) → moves to FAILED
 *     (NOTE: reject does NOT auto-refund the user — that's a manual follow-up
 *     action until the ledger-reversal helper is built.)
 *   - Mark a PROCESSING request as Settled → records Graph externalRef
 *
 * USDT / Bridge payouts are NOT handled here — they live on the legacy admin
 * at admin.frenzpay.co.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Eye, Loader2, X } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency, formatDateTime, maskAccountNumber } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type WithdrawalStatus =
  | 'PENDING_OTP'
  | 'PENDING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'FAILED'
  | 'REFUNDED';

interface WithdrawalRow {
  id: string;
  status: WithdrawalStatus;
  provider: string;
  // All amounts are strings (BigInt serialised) — parse with Number when safe
  sourceAmountCents: string;
  destAmountKobo: string;
  fxRateMicro: string;
  fxMarkupBps: number;
  feeCents: string;
  externalRef: string | null;
  failureReason: string | null;
  settledAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    kycTier: string;
    status: string;
  } | null;
  beneficiary: {
    bankName: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    accountName: string | null;
    currency: string | null;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<WithdrawalStatus, string> = {
  PENDING_OTP: 'bg-muted text-muted-foreground',
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SETTLED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REFUNDED: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
};

/** USD cents → display dollars. Safe for values up to Number.MAX_SAFE_INTEGER/100. */
function centsToUsd(cents: string): number {
  return Number(cents) / 100;
}

/** NGN kobo → display naira. */
function koboToNgn(kobo: string): number {
  return Number(kobo) / 100;
}

/** FX rate (USD → NGN) from `fxRateMicro` (rate × 1e6). */
function formatFxRate(micro: string): string {
  const rate = Number(micro) / 1_000_000;
  return rate.toFixed(2);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WithdrawalRow | null>(null);

  // Action-state for the detail dialog
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [settledOpen, setSettledOpen] = useState(false);
  const [externalRef, setExternalRef] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/withdrawals?status=all&limit=200', {
        cache: 'no-store',
      });
      if (res.status === 403) {
        toast.error('Not authorised — admin sign-in required.');
        setRows([]);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
      setRows(json.withdrawals ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load withdrawals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // ── Group rows by tab ─────────────────────────────────────────────────────
  const { pending, processing, settled, failed } = useMemo(() => {
    const pending: WithdrawalRow[] = [];
    const processing: WithdrawalRow[] = [];
    const settled: WithdrawalRow[] = [];
    const failed: WithdrawalRow[] = [];
    for (const r of rows) {
      if (r.status === 'PENDING' || r.status === 'PENDING_OTP') pending.push(r);
      else if (r.status === 'PROCESSING') processing.push(r);
      else if (r.status === 'SETTLED') settled.push(r);
      else failed.push(r); // FAILED + REFUNDED
    }
    return { pending, processing, settled, failed };
  }, [rows]);

  // ── Dialog reset ──────────────────────────────────────────────────────────
  function closeDialog() {
    setSelected(null);
    setRejectOpen(false);
    setSettledOpen(false);
    setRejectReason('');
    setExternalRef('');
  }

  // ── Action handlers ───────────────────────────────────────────────────────
  async function approve(id: string) {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Approve failed (${res.status})`);
      toast.success('Approved — moved to Processing');
      closeDialog();
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActing(false);
    }
  }

  async function reject(id: string) {
    if (rejectReason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejectionReason: rejectReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Reject failed (${res.status})`);
      toast.success('Rejected. Remember to refund the user manually.', { duration: 6000 });
      closeDialog();
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActing(false);
    }
  }

  async function markSettled(id: string) {
    if (externalRef.trim().length === 0) {
      toast.error('Graph payout reference is required');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_settled', externalRef: externalRef.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      toast.success('Marked as Settled');
      closeDialog();
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark settled');
    } finally {
      setActing(false);
    }
  }

  // ── Row table ─────────────────────────────────────────────────────────────
  function WithdrawalTable({ records }: { records: WithdrawalRow[] }) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>USD Debit</TableHead>
              <TableHead>NGN Payout</TableHead>
              <TableHead className="hidden md:table-cell">Bank</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No withdrawals in this category.
                </TableCell>
              </TableRow>
            ) : (
              records.map((w) => (
                <TableRow key={w.id} className="hover:bg-muted/50">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(w.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{w.user?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{w.user?.email ?? ''}</div>
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatCurrency(centsToUsd(w.sourceAmountCents), 'USD')}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatCurrency(koboToNgn(w.destAmountKobo), 'NGN')}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs">
                    {w.beneficiary ? (
                      <>
                        <div className="font-medium">{w.beneficiary.bankName ?? '—'}</div>
                        <div className="font-mono text-muted-foreground">
                          {w.beneficiary.accountNumber
                            ? maskAccountNumber(w.beneficiary.accountNumber)
                            : '—'}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLES[w.status]}>{w.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setSelected(w)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Withdrawal Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review, approve, and track NGN payout requests (Graph rail).
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading withdrawals…
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <div className="border-b px-4 pt-3">
                <TabsList variant="line">
                  <TabsTrigger value="pending">
                    Pending Review
                    {pending.length > 0 && (
                      <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
                        {pending.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="processing">
                    Processing
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({processing.length})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="settled">
                    Settled
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({settled.length})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="failed">
                    Failed / Refunded
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({failed.length})
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="pending">
                <WithdrawalTable records={pending} />
              </TabsContent>
              <TabsContent value="processing">
                <WithdrawalTable records={processing} />
              </TabsContent>
              <TabsContent value="settled">
                <WithdrawalTable records={settled} />
              </TabsContent>
              <TabsContent value="failed">
                <WithdrawalTable records={failed} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdrawal Details</DialogTitle>
            <DialogDescription>Review the payout before approving.</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p className="font-medium">{selected.user?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{selected.user?.email ?? ''}</p>
                  {selected.user && (
                    <p className="text-xs mt-1">
                      KYC {selected.user.kycTier}
                      {' · '}
                      {selected.user.status}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={STATUS_STYLES[selected.status]}>{selected.status}</Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDateTime(selected.createdAt)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">USD Debit</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(centsToUsd(selected.sourceAmountCents), 'USD')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">NGN Payout</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(koboToNgn(selected.destAmountKobo), 'NGN')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">FX Rate</p>
                  <p className="font-medium">
                    1 USD = ₦{formatFxRate(selected.fxRateMicro)}
                    <span className="text-xs text-muted-foreground ml-2">
                      (+{selected.fxMarkupBps} bps markup)
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fee</p>
                  <p className="font-medium">
                    {formatCurrency(centsToUsd(selected.feeCents), 'USD')}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-muted-foreground">Beneficiary</p>
                {selected.beneficiary ? (
                  <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                    <p className="font-medium">
                      {selected.beneficiary.accountName ?? '—'}
                    </p>
                    <p className="text-muted-foreground">
                      {selected.beneficiary.bankName ?? '—'}{' '}
                      {selected.beneficiary.bankCode
                        ? `(${selected.beneficiary.bankCode})`
                        : ''}
                    </p>
                    <p className="font-mono text-xs mt-1">
                      {selected.beneficiary.accountNumber ?? '—'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Beneficiary record missing.</p>
                )}
              </div>

              {selected.externalRef && (
                <div>
                  <p className="text-muted-foreground">Graph Reference</p>
                  <p className="font-mono text-xs break-all bg-muted rounded p-2 mt-1">
                    {selected.externalRef}
                  </p>
                </div>
              )}

              {selected.failureReason && (
                <div>
                  <p className="text-muted-foreground">Failure Reason</p>
                  <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2 mt-1">
                    {selected.failureReason}
                  </p>
                </div>
              )}

              {/* ─── Actions ─────────────────────────────────────────────── */}

              {/* PENDING: approve + reject */}
              {selected.status === 'PENDING' && !rejectOpen && (
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                    onClick={() => approve(selected.id)}
                    disabled={acting}
                  >
                    {acting ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setRejectOpen(true)}
                    disabled={acting}
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Reject
                  </Button>
                </DialogFooter>
              )}

              {/* PENDING → reject form */}
              {selected.status === 'PENDING' && rejectOpen && (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Reject will NOT automatically refund the user&apos;s balance. You must
                      process the refund manually via the ledger until we ship the auto-refund
                      action.
                    </AlertDescription>
                  </Alert>
                  <Label className="text-sm font-medium text-red-600">
                    Rejection Reason (min 10 chars)
                  </Label>
                  <Textarea
                    placeholder="Why is this withdrawal being rejected?"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    disabled={acting}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      disabled={acting || rejectReason.trim().length < 10}
                      onClick={() => reject(selected.id)}
                    >
                      {acting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Confirm Rejection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRejectOpen(false);
                        setRejectReason('');
                      }}
                      disabled={acting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* PROCESSING → mark settled */}
              {selected.status === 'PROCESSING' && !settledOpen && (
                <DialogFooter>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setSettledOpen(true)}
                    disabled={acting}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Mark as Settled
                  </Button>
                </DialogFooter>
              )}

              {selected.status === 'PROCESSING' && settledOpen && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Graph Payout Reference</Label>
                  <Input
                    placeholder="e.g. graph_payout_01HXYZ..."
                    value={externalRef}
                    onChange={(e) => setExternalRef(e.target.value)}
                    className="font-mono text-xs"
                    disabled={acting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the payout ID from Graph&apos;s dashboard. This is what links our
                    record back to the off-platform settlement.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={acting || externalRef.trim().length === 0}
                      onClick={() => markSettled(selected.id)}
                    >
                      {acting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Confirm Settlement
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSettledOpen(false);
                        setExternalRef('');
                      }}
                      disabled={acting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Terminal states — close only */}
              {(selected.status === 'SETTLED' ||
                selected.status === 'FAILED' ||
                selected.status === 'REFUNDED' ||
                selected.status === 'PENDING_OTP') && (
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button variant="outline" className="w-full">
                        Close
                      </Button>
                    }
                  />
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
