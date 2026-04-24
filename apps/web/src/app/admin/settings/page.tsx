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
  fxMarkupBps: number;
  minWithdrawalUsd: number;

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
  fxMarkupBps: 50,
  minWithdrawalUsd: 10,
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
          <Card>
            <CardHeader>
              <CardTitle>Fees &amp; FX</CardTitle>
              <CardDescription>
                Withdrawal fee, FX markup, and minimum payout amount. Used by the Graph rail
                quote engine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Withdrawal Fee (%)</Label>
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
                    Percentage fee on every withdrawal.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>FX Markup (bps)</Label>
                  <Input
                    type="number"
                    step="5"
                    min="0"
                    max="1000"
                    value={settings.fxMarkupBps}
                    onChange={(e) => set('fxMarkupBps', parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    100 bps = 1%. Added to USD→NGN mid-market rate.
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
                </div>
              </div>
              <Button
                disabled={saving !== null}
                onClick={() =>
                  save('Fees & FX', ['withdrawalFeePercent', 'fxMarkupBps', 'minWithdrawalUsd'])
                }
              >
                {saving === 'Fees & FX' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
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
