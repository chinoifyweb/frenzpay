'use client';

/**
 * /admin/settings
 *
 * Platform-wide settings with real persistence.
 *
 * Every writeable field reads its current value from /api/admin/settings and
 * writes via PUT. System tab shows the most recent admin_audit_logs entries.
 *
 * TRC-20 / ERC-20 network fee fields from the prior USDT draft are gone —
 * this interface is NGN (Graph) only. Bridge/USDT settings live on the
 * legacy admin.frenzpay.co surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  DollarSign,
  Shield,
  Server,
  CreditCard,
  Copy,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ── Types ────────────────────────────────────────────────────────────────

interface SettingsPayload {
  platformName: string;
  supportEmail: string;
  announcement: string;
  maintenanceMode: boolean;

  withdrawalFeePercent: number;
  withdrawalFeeFlatCents: number;
  fxMarkupBps: number;
  fxManualRateUsdNgn: number;
  minWithdrawalUsd: number;
  monthlyMaintenanceFeeUsdCents: number;

  // Card fees
  cardCreationFeeUsdCents: number;
  cardMonthlyFeeUsdCents: number;
  cardTransactionFeePercent: number;
  cardForeignTxFeePercent: number;
  cardReplacementFeeUsdCents: number;

  kycRequiredForWithdrawal: boolean;
  dailyWithdrawalLimitUsd: number;
  monthlyWithdrawalLimitUsd: number;
  amlAlertThresholdUsd: number;
}

interface AuditRow {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  adminEmail: string;
  createdAt: string;
  metadata: unknown;
}

const DEFAULTS: SettingsPayload = {
  platformName: 'FrenzPay',
  supportEmail: 'support@frenzpay.co',
  announcement: '',
  maintenanceMode: false,
  withdrawalFeePercent: 1.5,
  withdrawalFeeFlatCents: 0,
  fxMarkupBps: 50,
  fxManualRateUsdNgn: 0,
  minWithdrawalUsd: 10,
  monthlyMaintenanceFeeUsdCents: 0,
  cardCreationFeeUsdCents: 0,
  cardMonthlyFeeUsdCents: 0,
  cardTransactionFeePercent: 0,
  cardForeignTxFeePercent: 0,
  cardReplacementFeeUsdCents: 0,
  kycRequiredForWithdrawal: true,
  dailyWithdrawalLimitUsd: 50_000,
  monthlyWithdrawalLimitUsd: 500_000,
  amlAlertThresholdUsd: 10_000,
};

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // ── Load current settings on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
        setSettings({ ...DEFAULTS, ...(json.settings ?? {}) });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/admin/audit?limit=25', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Load failed (${res.status})`);
      setAuditRows(json.entries ?? []);
    } catch {
      // Non-fatal — show empty table rather than a crash
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);

  // ── Save helper ────────────────────────────────────────────────────────
  async function save(section: string, keys: (keyof SettingsPayload)[]) {
    setSaving(section);
    try {
      const updates: Partial<SettingsPayload> = {};
      for (const k of keys) (updates as any)[k] = settings[k];
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldErr =
          json.fields && typeof json.fields === 'object'
            ? Object.values(json.fields).join('; ')
            : null;
        throw new Error(fieldErr ?? json.error ?? `Save failed (${res.status})`);
      }
      toast.success(`${section} saved`);
      void fetchAudit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  function set<K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground">
          Configure platform-wide settings. Changes are audited.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            Fees &amp; FX
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            Card fees
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5">
            <Shield className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Server className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        {/* ── General ─────────────────────────────────────────────────── */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Platform name, support contact, banner, maintenance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input
                    id="platformName"
                    value={settings.platformName}
                    onChange={(e) => set('platformName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) => set('supportEmail', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement">Announcement Banner</Label>
                <Textarea
                  id="announcement"
                  placeholder="Leave empty to hide the banner"
                  value={settings.announcement}
                  onChange={(e) => set('announcement', e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Displayed at the top of all customer pages when set.</p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Maintenance Mode</p>
                  <p className="text-sm text-muted-foreground">
                    When on, customers see a maintenance screen and cannot sign in.
                  </p>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(v) => set('maintenanceMode', v)}
                />
              </div>
              {settings.maintenanceMode && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Warning: Maintenance mode is <strong>ON</strong>. Customers cannot sign in or transact.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                disabled={saving !== null}
                onClick={() =>
                  save('General', ['platformName', 'supportEmail', 'announcement', 'maintenanceMode'])
                }
              >
                {saving === 'General' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fees & FX ─────────────────────────────────────────────────── */}
        <TabsContent value="fees">
          <div className="space-y-6">
            {/* Withdrawal fees */}
            <Card>
              <CardHeader>
                <CardTitle>Withdrawal fees</CardTitle>
                <CardDescription>
                  Charged per-payout. Percentage + flat amount are added together.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Percentage fee (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={settings.withdrawalFeePercent}
                      onChange={(e) =>
                        set('withdrawalFeePercent', parseFloat(e.target.value) || 0)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      % of the USD source amount. 1.5 = 1.5%.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Flat fee (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.withdrawalFeeFlatCents / 100).toFixed(2)}
                      onChange={(e) =>
                        set(
                          'withdrawalFeeFlatCents',
                          Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Fixed amount per withdrawal, added on top of the percentage.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum Withdrawal (USD)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={settings.minWithdrawalUsd}
                      onChange={(e) => set('minWithdrawalUsd', parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Smallest amount a user can request.
                    </p>
                  </div>
                </div>
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('Withdrawal fees', [
                      'withdrawalFeePercent',
                      'withdrawalFeeFlatCents',
                      'minWithdrawalUsd',
                    ])
                  }
                >
                  {saving === 'Withdrawal fees' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            {/* FX rate */}
            <Card>
              <CardHeader>
                <CardTitle>USD \u2192 NGN rate</CardTitle>
                <CardDescription>
                  By default we use Graph&apos;s live mid-market rate plus the markup below. Set a
                  manual rate to override \u2014 useful when Graph&apos;s number drifts from the street rate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>FX Markup (bps)</Label>
                    <Input
                      type="number"
                      step="5"
                      min="0"
                      max="1000"
                      value={settings.fxMarkupBps}
                      onChange={(e) => set('fxMarkupBps', parseInt(e.target.value) || 0)}
                      disabled={settings.fxManualRateUsdNgn > 0}
                    />
                    <p className="text-xs text-muted-foreground">
                      100 bps = 1%. Subtracted from mid-market (sell-side).
                      Ignored when manual rate is set.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Manual rate override (1 USD = ? NGN)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100000"
                      value={settings.fxManualRateUsdNgn}
                      onChange={(e) =>
                        set('fxManualRateUsdNgn', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0 = auto"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 means auto-fetch from Graph. Any positive number bypasses Graph + markup.
                    </p>
                  </div>
                </div>
                {settings.fxManualRateUsdNgn > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Manual rate is active: customers will see <strong>1 USD = \u20a6
                      {settings.fxManualRateUsdNgn.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}</strong>. Set back to 0 to resume live Graph rates.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('FX rate', ['fxMarkupBps', 'fxManualRateUsdNgn'])
                  }
                >
                  {saving === 'FX rate' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save FX rate
                </Button>
              </CardContent>
            </Card>

            {/* Monthly maintenance */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly account maintenance</CardTitle>
                <CardDescription>
                  Automatic monthly charge on every active KYC-verified user.
                  The cron worker runs on the 1st of each month and debits the fee from
                  the user&apos;s USD balance. If balance is below the fee, the user is skipped
                  (no negative balance) and retried the next month.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Monthly fee (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.monthlyMaintenanceFeeUsdCents / 100).toFixed(2)}
                      onChange={(e) =>
                        set(
                          'monthlyMaintenanceFeeUsdCents',
                          Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      0 disables the charge entirely.
                    </p>
                  </div>
                </div>
                {settings.monthlyMaintenanceFeeUsdCents > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Customers will be charged{' '}
                      <strong>
                        ${(settings.monthlyMaintenanceFeeUsdCents / 100).toFixed(2)}
                      </strong>{' '}
                      on the 1st of every month. Each charge writes a FEE Transaction
                      with metadata.kind=&quot;maintenance&quot;, idempotent per user per month.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('Maintenance fee', ['monthlyMaintenanceFeeUsdCents'])
                  }
                >
                  {saving === 'Maintenance fee' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save maintenance fee
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Card fees ─────────────────────────────────────────────────── */}
        <TabsContent value="cards">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>One-off card fees</CardTitle>
                <CardDescription>
                  Charged at issuance / replacement. All values in USD; debited from
                  the user&apos;s available balance at the moment of action.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Card creation fee (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.cardCreationFeeUsdCents / 100).toFixed(2)}
                      onChange={(e) =>
                        set(
                          'cardCreationFeeUsdCents',
                          Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Charged once when a customer issues a virtual USD card. Card creation
                      fails if balance is insufficient.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Card replacement fee (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.cardReplacementFeeUsdCents / 100).toFixed(2)}
                      onChange={(e) =>
                        set(
                          'cardReplacementFeeUsdCents',
                          Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Charged when a customer requests a replacement (lost / stolen / damaged).
                    </p>
                  </div>
                </div>
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('Card one-off fees', [
                      'cardCreationFeeUsdCents',
                      'cardReplacementFeeUsdCents',
                    ])
                  }
                >
                  {saving === 'Card one-off fees' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recurring card fees</CardTitle>
                <CardDescription>
                  Monthly fee per active card. Charged by cron on the 1st of every month;
                  cards backed by users with insufficient balance are skipped + retried
                  next month (we never let balances go negative).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Monthly card fee (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(settings.cardMonthlyFeeUsdCents / 100).toFixed(2)}
                      onChange={(e) =>
                        set(
                          'cardMonthlyFeeUsdCents',
                          Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      0 disables. Charged per active card every month.
                    </p>
                  </div>
                </div>
                {settings.cardMonthlyFeeUsdCents > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Each active card will be charged{' '}
                      <strong>
                        ${(settings.cardMonthlyFeeUsdCents / 100).toFixed(2)}
                      </strong>{' '}
                      on the 1st of every month. Idempotent per (cardId, YYYY-MM) so
                      re-running the cron is safe.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('Card monthly fee', ['cardMonthlyFeeUsdCents'])
                  }
                >
                  {saving === 'Card monthly fee' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save monthly fee
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per-transaction card fees</CardTitle>
                <CardDescription>
                  Applied at each card charge via the card.transaction webhook.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Transaction fee (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={settings.cardTransactionFeePercent}
                      onChange={(e) =>
                        set('cardTransactionFeePercent', parseFloat(e.target.value) || 0)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Percentage of every charge amount. 0 = no extra fee on top of
                      whatever Graph passes through.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Foreign-currency surcharge (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={settings.cardForeignTxFeePercent}
                      onChange={(e) =>
                        set('cardForeignTxFeePercent', parseFloat(e.target.value) || 0)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Additional % when merchant currency is not USD. Stacks on top of the
                      transaction fee above.
                    </p>
                  </div>
                </div>
                <Button
                  disabled={saving !== null}
                  onClick={() =>
                    save('Card transaction fees', [
                      'cardTransactionFeePercent',
                      'cardForeignTxFeePercent',
                    ])
                  }
                >
                  {saving === 'Card transaction fees' && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save transaction fees
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Compliance ──────────────────────────────────────────────── */}
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
              <CardDescription>KYC requirements and per-user transaction limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">KYC required for withdrawals</p>
                  <p className="text-sm text-muted-foreground">
                    Users must reach KYC tier ≥ T1 before they can withdraw.
                  </p>
                </div>
                <Switch
                  checked={settings.kycRequiredForWithdrawal}
                  onCheckedChange={(v) => set('kycRequiredForWithdrawal', v)}
                />
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Daily Withdrawal Limit (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={settings.dailyWithdrawalLimitUsd}
                    onChange={(e) =>
                      set('dailyWithdrawalLimitUsd', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Withdrawal Limit (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={settings.monthlyWithdrawalLimitUsd}
                    onChange={(e) =>
                      set('monthlyWithdrawalLimitUsd', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>AML Alert Threshold (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={settings.amlAlertThresholdUsd}
                    onChange={(e) =>
                      set('amlAlertThresholdUsd', parseFloat(e.target.value) || 0)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Transactions above this value trigger AML review.
                  </p>
                </div>
              </div>
              <Button
                disabled={saving !== null}
                onClick={() =>
                  save('Compliance', [
                    'kycRequiredForWithdrawal',
                    'dailyWithdrawalLimitUsd',
                    'monthlyWithdrawalLimitUsd',
                    'amlAlertThresholdUsd',
                  ])
                }
              >
                {saving === 'Compliance' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── System ──────────────────────────────────────────────────── */}
        <TabsContent value="system">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API & Webhooks</CardTitle>
                <CardDescription>Public endpoints for integrations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Base URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value="https://app.frenzpay.co/api"
                      readOnly
                      className="font-mono text-sm bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard('https://app.frenzpay.co/api')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value="https://app.frenzpay.co/api/webhooks"
                      readOnly
                      className="font-mono text-sm bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard('https://app.frenzpay.co/api/webhooks')
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>
                  Recent administrative actions (newest first). Append-only, immutable.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                          <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : auditRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No admin actions recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{r.adminEmail}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {r.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.resourceType ?? '—'}
                            {r.resourceId ? ` · ${r.resourceId.slice(0, 8)}…` : ''}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
