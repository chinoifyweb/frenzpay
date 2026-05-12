'use client';

/**
 * /dashboard/withdraw
 *
 * Full NGN withdrawal flow on the Graph rail:
 *   1. Pick amount in USD.
 *   2. Pick or create a beneficiary (Nigerian bank) — on-blur resolve-bank-account
 *      confirms the account-holder name before saving.
 *   3. See a live FX quote (USD → NGN) with markup from platform settings.
 *   4. Confirm. Back-end holds the USD, creates a PENDING Withdrawal; an admin
 *      reviews within 24h and releases the payout via Graph (NIP transfer).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMe } from '@/hooks/use-me';

// ── Types ──────────────────────────────────────────────────────────────────

interface Bank {
  bank_code: string;
  bank_name: string;
  country: string;
}

interface Beneficiary {
  id: string;
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  coolingPeriodEndsAt: string | null;
}

interface FxQuote {
  midRate: number;
  markupBps: number;
  effectiveRate: number;
  rate_id: string | null;
  expires_at: string | null;
  source?: 'graph' | 'manual';
  withdrawalFeePercent?: number;
  withdrawalFeeFlatCents?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtNgn(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────

type Stage = 'form' | 'submitted';

export default function WithdrawPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const tier = me?.kycTier ?? 'T0';
  const kycApproved = tier === 'T2' || tier === 'T3';

  // Beneficiary state
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [showNewBeneficiary, setShowNewBeneficiary] = useState(false);

  // New-beneficiary form
  const [newBankCode, setNewBankCode] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [savingBeneficiary, setSavingBeneficiary] = useState(false);

  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>('');

  // Amount + quote
  const [amountUsd, setAmountUsd] = useState('');
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Authenticator-app code is required by /api/withdrawals — captured
  // inside the confirm dialog and sent as X-Mfa-Token. Server returns
  // 403 with `enrollRequired: true` if the customer hasn't set up TOTP.
  const [totpCode, setTotpCode] = useState('');
  const [totpEnrollRequired, setTotpEnrollRequired] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [submittedWithdrawal, setSubmittedWithdrawal] = useState<{
    id: string;
    destAmountKobo: string;
    sourceAmountCents: string;
  } | null>(null);

  // ── Initial loads ───────────────────────────────────────────────────────
  const fetchBanks = useCallback(async () => {
    setBanksLoading(true);
    try {
      const res = await fetch('/api/banks', { cache: 'no-store' });
      // Guard against non-JSON responses (proxy timeout HTML pages etc).
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) throw new Error(json.error ?? 'Could not load banks');
      setBanks(json.banks ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load banks');
    } finally {
      setBanksLoading(false);
    }
  }, []);

  const fetchBeneficiaries = useCallback(async () => {
    try {
      const res = await fetch('/api/beneficiaries', { cache: 'no-store' });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) throw new Error(json.error ?? 'Could not load beneficiaries');
      const bens: Beneficiary[] = (json.beneficiaries ?? []).filter(
        (b: Beneficiary) => b.bankCode && b.accountNumber,
      );
      setBeneficiaries(bens);
      if (bens.length > 0 && !selectedBeneficiaryId) {
        setSelectedBeneficiaryId(bens[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load beneficiaries');
    }
  }, [selectedBeneficiaryId]);

  useEffect(() => {
    void fetchBanks();
    void fetchBeneficiaries();
  }, [fetchBanks, fetchBeneficiaries]);

  // Refresh FX quote when amount changes (debounced)
  useEffect(() => {
    if (!amountUsd || parseFloat(amountUsd) <= 0) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch('/api/fx/quote?base=USD&quote=NGN', { cache: 'no-store' });
        const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
        if (!isJson) {
          if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
            throw new Error('Server is slow or unreachable, please try again.');
          }
          throw new Error(`Unexpected error (HTTP ${res.status}).`);
        }
        const json = (await res.json().catch(() => null)) ?? {};
        if (!res.ok) throw new Error(json.error ?? 'FX fetch failed');
        setQuote({
          midRate: json.midRate,
          markupBps: json.markupBps,
          effectiveRate: json.effectiveRate,
          rate_id: json.rate_id ?? null,
          expires_at: json.expires_at ?? null,
          source: json.source,
          withdrawalFeePercent: json.withdrawalFeePercent,
          withdrawalFeeFlatCents: json.withdrawalFeeFlatCents,
        });
      } catch (err) {
        setQuote(null);
        toast.error(err instanceof Error ? err.message : 'Rate fetch failed');
      } finally {
        setQuoteLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [amountUsd]);

  // ── Resolve-on-blur for new-beneficiary form ─────────────────────────────
  async function resolveAccount() {
    setResolveError(null);
    if (!newBankCode || !/^\d{10}$/.test(newAccountNumber)) return;
    setResolving(true);
    try {
      const res = await fetch('/api/banks/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_code: newBankCode, account_number: newAccountNumber }),
      });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          setResolveError('Server is slow or unreachable, please try again.');
        } else {
          setResolveError(`Unexpected error (HTTP ${res.status}).`);
        }
        setNewAccountName('');
        return;
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) {
        setResolveError(json.error ?? 'Could not verify account');
        setNewAccountName('');
        return;
      }
      setNewAccountName(json.account_name ?? '');
    } catch {
      setResolveError('Network error verifying account');
    } finally {
      setResolving(false);
    }
  }

  async function saveBeneficiary() {
    if (!newBankCode || !/^\d{10}$/.test(newAccountNumber)) {
      toast.error('Pick a bank and enter a 10-digit account number');
      return;
    }
    setSavingBeneficiary(true);
    try {
      const bank = banks.find((b) => b.bank_code === newBankCode);
      const res = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_code: newBankCode,
          account_number: newAccountNumber,
          account_name: newAccountName || undefined,
          bank_name: bank?.bank_name,
        }),
      });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok && res.status !== 409) throw new Error(json.error ?? `Save failed (${res.status})`);
      toast.success('Beneficiary saved');
      setShowNewBeneficiary(false);
      setNewBankCode('');
      setNewAccountNumber('');
      setNewAccountName('');
      setResolveError(null);
      await fetchBeneficiaries();
      if (json.beneficiary?.id) setSelectedBeneficiaryId(json.beneficiary.id);
      else if (json.beneficiaryId) setSelectedBeneficiaryId(json.beneficiaryId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingBeneficiary(false);
    }
  }

  // ── Submit withdrawal ────────────────────────────────────────────────────
  const selectedBeneficiary = useMemo(
    () => beneficiaries.find((b) => b.id === selectedBeneficiaryId) ?? null,
    [beneficiaries, selectedBeneficiaryId],
  );

  async function submitWithdrawal() {
    if (!selectedBeneficiary) {
      toast.error('Pick a beneficiary first');
      return;
    }
    const cents = Math.round(parseFloat(amountUsd || '0') * 100);
    if (!cents || cents <= 0) {
      toast.error('Enter a valid USD amount');
      return;
    }
    if (totpCode.length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setSubmitting(true);
    try {
      // Mint a fresh idempotency key on each submit attempt. The server-
      // side unique constraint still dedupes against any successful prior
      // post if the user clicks again after a fetch timeout.
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          // Authenticator code — required by /api/withdrawals.
          // Email OTP is not acceptable for money movement.
          'X-Mfa-Token': totpCode,
        },
        body: JSON.stringify({
          beneficiaryId: selectedBeneficiary.id,
          sourceAmountCents: cents,
          rate_id: quote?.rate_id ?? undefined,
        }),
      });
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.');
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`);
      }
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) {
        // 403 + enrollRequired means the customer hasn't enrolled TOTP yet.
        // Push them to /dashboard/security with a clear toast — don't
        // confuse them with "wrong code".
        if (res.status === 403 && json.enrollRequired) {
          setTotpEnrollRequired(true);
          throw new Error(
            'Set up Google Authenticator before withdrawing — Security in your dashboard.',
          );
        }
        throw new Error(json.error ?? `Submission failed (${res.status})`);
      }
      setSubmittedWithdrawal({
        id: json.withdrawal.id,
        destAmountKobo: json.withdrawal.destAmountKobo,
        sourceAmountCents: json.withdrawal.sourceAmountCents,
      });
      setStage('submitted');
      toast.success('Withdrawal submitted for review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
      // Clear the code so the user has to type a fresh one — TOTP codes
      // rotate every 30 seconds anyway.
      setTotpCode('');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render: KYC gate ────────────────────────────────────────────────────
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
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to overview
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-lg font-semibold">Complete KYC to withdraw</h2>
              <p className="text-sm text-muted-foreground">
                You need to be verified (tier 2) before we can release funds to a Nigerian bank.
                It&apos;s a quick one-time step.
              </p>
            </div>
            <Badge variant="secondary" className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              You&apos;re currently {tier}
            </Badge>
            <Link href="/dashboard/kyc">
              <Button>Start verification</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: submitted confirmation ──────────────────────────────────────
  if (stage === 'submitted' && submittedWithdrawal) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6">
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-lg font-semibold">Submitted for review</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;re holding{' '}
                {fmtUsd(Number(submittedWithdrawal.sourceAmountCents))} and will release{' '}
                {fmtNgn(Number(submittedWithdrawal.destAmountKobo))} to your bank once an
                admin approves the request — usually within 24h.
              </p>
              <p className="text-xs text-muted-foreground">
                Reference: <span className="font-mono">{submittedWithdrawal.id.slice(0, 8)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage('form')}>
                New withdrawal
              </Button>
              <Link href="/dashboard/activity">
                <Button>View activity</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: main form ───────────────────────────────────────────────────
  const amountCents = Math.round(parseFloat(amountUsd || '0') * 100);
  // Net-of-fees NGN the customer actually receives. Fees (percentage + flat)
  // are subtracted from the USD source amount first, then we convert.
  const feeBreakdown = (() => {
    if (!quote || amountCents <= 0) {
      return { feePctCents: 0, feeFlatCents: 0, totalFeeCents: 0, netKobo: 0 };
    }
    const feePct = quote.withdrawalFeePercent ?? 1.5;
    const feeFlatCents = quote.withdrawalFeeFlatCents ?? 0;
    const feePctCents = Math.floor(amountCents * (feePct / 100));
    const totalFeeCents = feePctCents + feeFlatCents;
    const netSourceCents = Math.max(0, amountCents - totalFeeCents);
    const netKobo = Math.floor(netSourceCents * quote.effectiveRate);
    return { feePctCents, feeFlatCents, totalFeeCents, netKobo };
  })();
  const estimatedKobo = feeBreakdown.netKobo;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to overview
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Withdraw to Nigerian bank</h1>
        <p className="text-sm text-muted-foreground">
          Send NGN from your USD balance to any Nigerian bank account. Admin-reviewed within 24h.
        </p>
      </div>

      {/* Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Amount
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amountUsd">USD amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="amountUsd"
                type="number"
                step="0.01"
                min="1"
                inputMode="decimal"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                className="pl-7 text-lg font-medium"
                placeholder="100.00"
              />
            </div>
            <p className="text-xs text-muted-foreground">Minimum $10</p>
          </div>

          {quoteLoading && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Fetching rate…
            </p>
          )}

          {quote && amountCents > 0 && (() => {
            const feePct = quote.withdrawalFeePercent ?? 1.5;
            const feeFlatCents = quote.withdrawalFeeFlatCents ?? 0;
            const feePctCents = Math.floor(amountCents * (feePct / 100));
            const totalFeeCents = feePctCents + feeFlatCents;
            const netSourceCents = amountCents - totalFeeCents;
            const netKobo = Math.max(0, Math.floor(netSourceCents * quote.effectiveRate));
            return (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">
                    1 USD = ₦{quote.effectiveRate.toFixed(2)}
                    {quote.source === 'manual' && (
                      <span className="ml-2 text-[10px] uppercase text-amber-600">manual</span>
                    )}
                  </span>
                </div>
                {quote.source !== 'manual' && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>(mid {quote.midRate.toFixed(2)} minus {quote.markupBps} bps markup)</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee (percentage)</span>
                  <span className="font-mono">
                    {feePct}% → {fmtUsd(feePctCents)}
                  </span>
                </div>
                {feeFlatCents > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fee (flat)</span>
                    <span className="font-mono">{fmtUsd(feeFlatCents)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total fees</span>
                  <span className="font-mono">{fmtUsd(totalFeeCents)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">USD debited</span>
                  <span className="font-mono">{fmtUsd(amountCents)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-medium">You receive</span>
                  <span className="text-lg font-bold">{fmtNgn(netKobo)}</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Beneficiary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where should we send it?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {beneficiaries.length > 0 ? (
            <div className="space-y-2">
              {beneficiaries.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBeneficiaryId(b.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedBeneficiaryId === b.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{b.accountName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.bankName ?? b.bankCode} • {b.accountNumber}
                      </p>
                    </div>
                    {b.coolingPeriodEndsAt && new Date(b.coolingPeriodEndsAt) > new Date() && (
                      <Badge variant="secondary" className="text-[10px]">Cool-down</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No saved beneficiaries yet.</p>
          )}

          <Button
            variant="outline"
            onClick={() => setShowNewBeneficiary(true)}
            className="w-full"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add new beneficiary
          </Button>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        className="w-full h-11"
        disabled={
          !selectedBeneficiary ||
          amountCents <= 0 ||
          !!quoteLoading ||
          submitting
        }
        onClick={() => setConfirmOpen(true)}
      >
        Continue
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>

      {/* New beneficiary dialog */}
      <Dialog open={showNewBeneficiary} onOpenChange={setShowNewBeneficiary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add beneficiary</DialogTitle>
            <DialogDescription>
              The account holder&apos;s name will auto-populate once we verify the bank + account number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank</Label>
              <Select
                value={newBankCode}
                onValueChange={(v) => {
                  setNewBankCode(v);
                  setNewAccountName('');
                  setResolveError(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={banksLoading ? 'Loading banks…' : 'Choose a bank'} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {banks.map((b) => (
                    <SelectItem key={b.bank_code} value={b.bank_code}>
                      {b.bank_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct">Account number</Label>
              <Input
                id="acct"
                value={newAccountNumber}
                onChange={(e) => {
                  setNewAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setNewAccountName('');
                  setResolveError(null);
                }}
                onBlur={resolveAccount}
                className="font-mono"
                maxLength={10}
              />
            </div>

            {resolving && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verifying account…
              </p>
            )}
            {newAccountName && !resolving && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription>
                  <span className="font-medium">{newAccountName}</span>
                </AlertDescription>
              </Alert>
            )}
            {resolveError && (
              <Alert variant="destructive">
                <AlertDescription>{resolveError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewBeneficiary(false)}
              disabled={savingBeneficiary}
            >
              Cancel
            </Button>
            <Button
              onClick={saveBeneficiary}
              disabled={
                savingBeneficiary ||
                !newBankCode ||
                !/^\d{10}$/.test(newAccountNumber) ||
                !newAccountName
              }
            >
              {savingBeneficiary && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm withdrawal</DialogTitle>
            <DialogDescription>
              Double-check the amount and the bank account before submitting.
            </DialogDescription>
          </DialogHeader>
          {selectedBeneficiary && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium">{fmtUsd(amountCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient gets</span>
                  <span className="font-medium">{fmtNgn(estimatedKobo)}</span>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="font-medium">{selectedBeneficiary.accountName ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedBeneficiary.bankName ?? selectedBeneficiary.bankCode}
                </p>
                <p className="font-mono text-xs">{selectedBeneficiary.accountNumber}</p>
              </div>

              {/* Authenticator code — required by the server. Email OTP
                  is intentionally NOT accepted on this endpoint. */}
              {totpEnrollRequired ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Set up Google Authenticator first
                  </p>
                  <p className="text-xs text-amber-900/80 dark:text-amber-300/90">
                    Withdrawals require an authenticator-app code. Email OTP isn’t enough for moving money.
                  </p>
                  <Link
                    href="/dashboard/security"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 underline"
                  >
                    Open Security to enrol
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="totp-code" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Authenticator code
                  </Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="font-mono tracking-widest text-center"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Open Google Authenticator and copy the current 6-digit code for FrenzPay.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Once you submit we hold the USD and an admin reviews the request within 24h.
                The NGN releases to your bank after approval.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setTotpCode(''); setTotpEnrollRequired(false) }} disabled={submitting}>
              Cancel
            </Button>
            {!totpEnrollRequired && (
              <Button onClick={submitWithdrawal} disabled={submitting || totpCode.length !== 6}>
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Submit for review
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
