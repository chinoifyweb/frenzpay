'use client';

/**
 * /admin/users/[id]
 *
 * Read-only user detail page — the admin drills into a single customer to
 * triage their account. No edit controls here yet; for destructive actions
 * (freeze / unfreeze) use the dedicated endpoints which require TOTP.
 *
 * Loads a consolidated snapshot via GET /api/admin/users/[id]:
 *   - Identity
 *   - KYC history
 *   - Accounts (per-currency wallet records)
 *   - Recent transactions (last 20)
 *   - Recent withdrawals (last 10)
 *   - Recent admin actions against the user (last 20)
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Snowflake,
  Unlock,
  Mail,
  Phone,
  Globe,
  Calendar,
  KeyRound,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/utils';

interface UserDetail {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    country: string | null;
    status: string;
    kycTier: string;
    kycStatus: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    mfaRequired: boolean;
    isPep: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    frenzTag: { tag: string; isVerified: boolean } | null;
  };
  accounts: Array<{
    id: string;
    currency: string;
    subtype: string;
    createdAt: string;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    status: string;
    amount: string;
    currency: string;
    feeAmount: string;
    feeCurrency: string | null;
    externalRef: string | null;
    createdAt: string;
  }>;
  recentAdminActions: Array<{
    id: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    metadata: unknown;
    createdAt: string;
    adminEmail: string;
  }>;
  kycSubmissions: Array<{
    id: string;
    tier: string;
    status: string;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
  }>;
  withdrawals: Array<{
    id: string;
    status: string;
    sourceAmountCents: string;
    destAmountKobo: string;
    externalRef: string | null;
    createdAt: string;
    settledAt: string | null;
  }>;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  PENDING_KYC: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  FROZEN: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  DELETED: 'bg-muted text-muted-foreground',
};

function formatAmount(smallestUnit: string, currency: string): string {
  const amount = Number(smallestUnit) / 100;
  const symbol: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    NGN: '₦',
  };
  const sym = symbol[currency] ?? `${currency} `;
  return `${sym}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading user…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/users" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Link>
        <p className="text-sm text-muted-foreground">User not found or load failed.</p>
      </div>
    );
  }

  const { user, accounts, recentTransactions, recentAdminActions, kycSubmissions, withdrawals } =
    data;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.displayName ||
    user.email;

  return (
    <div className="space-y-6">
      {/* Back */}
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </span>
            {user.frenzTag && (
              <span className="font-mono text-xs">@{user.frenzTag.tag}</span>
            )}
            {user.country && (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {user.country}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={STATUS_STYLES[user.status] ?? ''}>{user.status}</Badge>
          <Badge variant="outline">KYC {user.kycTier}</Badge>
          <Badge variant="outline">{user.kycStatus}</Badge>
          {user.isPep && <Badge variant="destructive">PEP</Badge>}
        </div>
      </div>

      {/* Identity + flags */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Email Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.emailVerified ? (
              <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                <ShieldCheck className="h-4 w-4" />
                Yes
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <ShieldAlert className="h-4 w-4" />
                Not yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Phone Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.phoneVerified ? (
              <div className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
                <Phone className="h-4 w-4" />
                Yes
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Phone className="h-4 w-4" />
                Not yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              MFA Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-sm">{user.mfaRequired ? 'Yes' : 'Optional'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Joined
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {formatDateTime(user.createdAt)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead>Subtype</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead className="text-right">Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No accounts provisioned yet.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant="outline">{a.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.subtype}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {a.id}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* KYC submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KYC Submissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Reviewed</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kycSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No KYC submissions.
                  </TableCell>
                </TableRow>
              ) : (
                kycSubmissions.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <Badge variant="outline">{k.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.status === 'APPROVED' ? 'default' : 'secondary'}>
                        {k.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(k.submittedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {k.reviewedAt ? formatDateTime(k.reviewedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {k.rejectionReason ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Withdrawals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Withdrawals (NGN rail)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>USD Debit</TableHead>
                <TableHead>NGN Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Graph Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No withdrawals yet.
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(w.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatAmount(w.sourceAmountCents, 'USD')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatAmount(w.destAmountKobo, 'NGN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{w.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {w.externalRef ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {w.externalRef.slice(0, 14)}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions (last 20)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No activity yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(t.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatAmount(t.amount, t.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Admin actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Audit Trail (last 20)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAdminActions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No admin actions recorded against this user.
                  </TableCell>
                </TableRow>
              ) : (
                recentAdminActions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(a.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">{a.adminEmail}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.resourceType}
                      {a.resourceId ? ` · ${a.resourceId.slice(0, 8)}…` : ''}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Separator />

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <DangerZone user={user} />

      <p className="text-xs text-muted-foreground">
        Freeze / unfreeze require TOTP MFA. Enrol one at{' '}
        <Link href="/admin/security" className="text-primary hover:underline">
          /admin/security
        </Link>
        .
      </p>
    </div>
  );
}

// ── Danger zone (freeze / unfreeze / delete) ───────────────────────────────

function DangerZone({ user }: { user: UserDetail['user'] }) {
  const [modalMode, setModalMode] = useState<'freeze' | 'unfreeze' | null>(null);
  const [reason, setReason] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset-2FA modal state
  const [resetMfaOpen, setResetMfaOpen] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetDocs, setResetDocs] = useState(''); // newline-separated, parsed before send
  const [resetTotp, setResetTotp] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const isSuspended = user.status === 'SUSPENDED';
  const isDeleted = user.status === 'DELETED';

  async function submitResetMfa() {
    if (!/^\d{6}$/.test(resetTotp)) {
      toast.error('Enter your own 6-digit TOTP code');
      return;
    }
    if (resetReason.trim().length < 30) {
      toast.error('Describe what was verified in at least 30 characters');
      return;
    }
    const docs = resetDocs.split('\n').map((s) => s.trim()).filter(Boolean);
    if (docs.length === 0) {
      toast.error('List at least one document or verification step');
      return;
    }
    setResetSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: resetTotp,
          reason: resetReason.trim(),
          documentsReviewed: docs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Reset failed (${res.status})`);
      toast.success('Customer authenticator reset — they’ll re-enrol on next sign-in');
      setResetMfaOpen(false);
      setResetReason('');
      setResetDocs('');
      setResetTotp('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetSubmitting(false);
    }
  }

  async function submitFreezeOrUnfreeze() {
    if (!modalMode) return;
    if (!/^\d{6}$/.test(totpCode)) {
      toast.error('Enter the 6-digit TOTP code from your authenticator');
      return;
    }
    if (reason.trim().length < 20) {
      toast.error('Reason must be at least 20 characters');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/${modalMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? `${modalMode} failed (${res.status})`);
        return;
      }
      toast.success(modalMode === 'freeze' ? 'User frozen' : 'User unfrozen');
      setModalMode(null);
      setReason('');
      setTotpCode('');
      // Hard reload so the detail page reflects new status
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${modalMode} failed`);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteUser() {
    if (
      !confirm(
        `Delete user ${user.email}?\n\nThis frees the email for re-use and soft-deletes the row. If the user has approved KYC or open transactions, the delete is blocked.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? `Delete failed (${res.status})`);
        return;
      }
      toast.success('User deleted');
      window.location.href = '/admin/users';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Freeze / Unfreeze */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {isSuspended ? 'Unfreeze account' : 'Freeze account'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSuspended
                  ? 'Restore money-movement access. Requires TOTP + reason.'
                  : 'Block all send / withdraw / card actions immediately. Requires TOTP + reason.'}
              </p>
            </div>
            {isSuspended ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setModalMode('unfreeze'); setReason(''); setTotpCode(''); }}
                disabled={isDeleted}
              >
                <Unlock className="mr-1.5 h-4 w-4" />
                Unfreeze
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setModalMode('freeze'); setReason(''); setTotpCode(''); }}
                disabled={isDeleted}
              >
                <Snowflake className="mr-1.5 h-4 w-4" />
                Freeze
              </Button>
            )}
          </div>

          <Separator />

          {/* Reset customer's TOTP — for cases where the customer has lost
              their phone and produced supporting documents to prove
              identity. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Reset 2FA (Google Authenticator)</p>
              <p className="text-xs text-muted-foreground">
                Clears the customer&rsquo;s authenticator after they&rsquo;ve produced ID-proof. They&rsquo;ll fall back to email OTP on next sign-in and can re-enrol from Security.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setResetMfaOpen(true); setResetReason(''); setResetDocs(''); setResetTotp(''); }}
              disabled={isDeleted}
            >
              <KeyRound className="mr-1.5 h-4 w-4" />
              Reset 2FA
            </Button>
          </div>

          <Separator />

          {/* Delete */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete customer</p>
              <p className="text-xs text-muted-foreground">
                Only for users without approved KYC or open transactions. For approved
                customers use freeze instead.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteUser}
              disabled={isDeleted}
            >
              Delete user
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset 2FA modal */}
      <Dialog open={resetMfaOpen} onOpenChange={(o) => { if (!o) setResetMfaOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset customer 2FA</DialogTitle>
            <DialogDescription>
              Use this only when the customer has produced documents proving their identity (selfie with ID, live video call, etc). Both your TOTP code and a document list are required for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rm-reason">What was verified (min 30 chars)</Label>
              <Textarea
                id="rm-reason"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                rows={3}
                disabled={resetSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-docs">Documents reviewed (one per line)</Label>
              <Textarea
                id="rm-docs"
                value={resetDocs}
                onChange={(e) => setResetDocs(e.target.value)}
                rows={3}
                disabled={resetSubmitting}
              />
              <p className="text-[11px] text-muted-foreground">
                e.g. &quot;Selfie with NIN — sent via WhatsApp 2026-04-25&quot; / &quot;Live video call confirming face matches KYC&quot;.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-totp">Your 6-digit TOTP code</Label>
              <Input
                id="rm-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={resetTotp}
                onChange={(e) => setResetTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="font-mono tracking-widest text-center"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetMfaOpen(false)} disabled={resetSubmitting}>Cancel</Button>
            <Button
              onClick={submitResetMfa}
              disabled={resetSubmitting || resetReason.trim().length < 30 || !/^\d{6}$/.test(resetTotp)}
            >
              {resetSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Reset authenticator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze / Unfreeze modal */}
      <Dialog
        open={modalMode !== null}
        onOpenChange={(open) => { if (!open) setModalMode(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'freeze' ? 'Freeze account' : 'Unfreeze account'}
            </DialogTitle>
            <DialogDescription>
              {modalMode === 'freeze'
                ? 'This logs the user out of all devices and blocks all money movement until unfrozen.'
                : 'This restores money-movement access.'}
              {' '}Both the TOTP code and a reason are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dz-reason">Reason (min 20 chars)</Label>
              <Textarea
                id="dz-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  modalMode === 'freeze'
                    ? 'Suspected account takeover reported via support; freezing pending investigation.'
                    : 'Investigation complete, no fraud found, restoring access.'
                }
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dz-totp">6-digit TOTP code</Label>
              <Input
                id="dz-totp"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="font-mono text-lg tracking-widest text-center"
                maxLength={6}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                If you haven&apos;t enrolled TOTP yet, go to{' '}
                <Link href="/admin/security" className="text-primary hover:underline">
                  /admin/security
                </Link>{' '}
                first.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={modalMode === 'freeze' ? 'destructive' : 'default'}
              onClick={submitFreezeOrUnfreeze}
              disabled={submitting || totpCode.length !== 6 || reason.trim().length < 20}
            >
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirm {modalMode}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
