'use client';

/**
 * /admin/security
 *
 * Admin TOTP enrolment page. Two states:
 *   - Not enrolled: big "Enrol TOTP" button that triggers POST /api/admin/mfa/enroll
 *     and displays a QR code + manual-entry secret. After the admin scans +
 *     types the first 6-digit code, we call /verify and the secret is committed.
 *   - Enrolled: confirmation panel with a "Remove TOTP" button that asks for
 *     the current code before disenrolling.
 *
 * TOTP is mandatory for break-glass ops like freeze/unfreeze user, so the
 * page also lists which actions unlock after enrolment.
 */

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MfaState {
  enrolled: boolean;
  email: string;
  fullName: string;
}

export default function AdminSecurityPage() {
  const [state, setState] = useState<MfaState | null>(null);
  const [loading, setLoading] = useState(true);

  // Enrolment state
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Disenrol state
  const [disenrollOpen, setDisenrollOpen] = useState(false);
  const [disenrollCode, setDisenrollCode] = useState('');
  const [disenrolling, setDisenrolling] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mfa', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      setState({
        enrolled: !!json.enrolled,
        email: json.email,
        fullName: json.fullName,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  async function startEnrollment() {
    setEnrolling(true);
    setSecret(null);
    setQrDataUrl(null);
    setVerifyCode('');
    try {
      const res = await fetch('/api/admin/mfa/enroll', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Enrolment failed');
      setSecret(json.secret);
      // Render QR code as data URL we can stick into an <img src>
      const dataUrl = await QRCode.toDataURL(json.uri, {
        width: 240,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrolment failed');
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyEnrollment() {
    if (!/^\d{6}$/.test(verifyCode)) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/admin/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Verify failed');
      toast.success('TOTP enrolled — break-glass ops are now unlocked.');
      setSecret(null);
      setQrDataUrl(null);
      setVerifyCode('');
      await fetchState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  }

  async function disenroll() {
    if (!/^\d{6}$/.test(disenrollCode)) {
      toast.error('Enter the 6-digit code from your authenticator');
      return;
    }
    setDisenrolling(true);
    try {
      const res = await fetch('/api/admin/mfa/disenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disenrollCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Disenrol failed');
      toast.success('TOTP removed');
      setDisenrollOpen(false);
      setDisenrollCode('');
      await fetchState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disenrol failed');
    } finally {
      setDisenrolling(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(
      () => toast.success('Secret copied'),
      () => toast.error('Copy failed'),
    );
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Admin security
        </h1>
        <p className="text-sm text-muted-foreground">
          Two-factor authentication (TOTP) is required for high-privilege admin actions.
        </p>
      </div>

      {/* Current state */}
      {state.enrolled ? (
        <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">TOTP enrolled</p>
                <p className="text-xs text-muted-foreground">
                  {state.fullName} &lt;{state.email}&gt;
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDisenrollCode('');
                setDisenrollOpen(true);
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove TOTP
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            TOTP is not enrolled. Break-glass ops (freeze/unfreeze user) will be rejected
            until you enrol below.
          </AlertDescription>
        </Alert>
      )}

      {/* Enrolment flow */}
      {!state.enrolled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Enrol a new TOTP device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!secret ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You&apos;ll need an authenticator app (Authy, Google Authenticator, 1Password,
                  or similar) on your phone.
                </p>
                <Button onClick={startEnrollment} disabled={enrolling}>
                  {enrolling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Generate QR code
                </Button>
              </>
            ) : (
              <>
                <ol className="space-y-2 text-sm">
                  <li>
                    <strong>1.</strong> Open your authenticator app and scan the QR code below.
                  </li>
                  <li>
                    <strong>2.</strong> The app will show a rolling 6-digit code \u2014 type it into the
                    verification field.
                  </li>
                  <li>
                    <strong>3.</strong> Click <em>Confirm</em>. You&apos;ll be enrolled for break-glass
                    admin actions from then on.
                  </li>
                </ol>

                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="TOTP QR code" className="rounded bg-white p-2" />
                    <div className="w-full space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Or enter this secret manually
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={secret}
                          className="font-mono text-xs"
                        />
                        <Button variant="outline" size="icon" onClick={copySecret}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    The QR code is live for 10 minutes. If you close this page without verifying,
                    you&apos;ll need to generate a fresh code.
                  </AlertDescription>
                </Alert>

                <div className="space-y-1.5">
                  <Label htmlFor="vcode">6-digit code from your app</Label>
                  <Input
                    id="vcode"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="font-mono text-lg tracking-widest text-center"
                    maxLength={6}
                    autoFocus
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSecret(null);
                      setQrDataUrl(null);
                      setVerifyCode('');
                    }}
                    disabled={verifying}
                  >
                    Start over
                  </Button>
                  <Button
                    onClick={verifyEnrollment}
                    disabled={verifying || verifyCode.length !== 6}
                    className="flex-1"
                  >
                    {verifying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    <Check className="mr-1.5 h-4 w-4" />
                    Confirm
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* What TOTP unlocks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What TOTP unlocks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Freeze a user account</p>
              <p className="text-xs text-muted-foreground">
                Required under /admin/users/[id] Danger Zone when you suspect fraud.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Unfreeze a user</p>
              <p className="text-xs text-muted-foreground">
                Restores account access after investigation.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium">Future: role changes, bulk operations, ledger adjustments</p>
              <p className="text-xs text-muted-foreground">
                Any action that mutates user financial state will require TOTP.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disenrol dialog */}
      <Dialog open={disenrollOpen} onOpenChange={setDisenrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove TOTP</DialogTitle>
            <DialogDescription>
              Enter the current 6-digit code from your authenticator to confirm.
              Break-glass ops will be blocked after disenrolment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dcode">Current code</Label>
            <Input
              id="dcode"
              value={disenrollCode}
              onChange={(e) => setDisenrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="font-mono text-lg tracking-widest text-center"
              maxLength={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisenrollOpen(false)} disabled={disenrolling}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={disenroll}
              disabled={disenrolling || disenrollCode.length !== 6}
            >
              {disenrolling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
