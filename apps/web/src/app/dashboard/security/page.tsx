'use client'

/**
 * /dashboard/security
 *
 * Customer-side 2FA enrolment page. Mirrors the admin /admin/security
 * surface but uses the customer endpoints under /api/auth/mfa.
 *
 * States:
 *   - Not enrolled: a "Set up Google Authenticator" button. Hitting it
 *     calls POST /api/auth/mfa/totp-setup, gets back a QR-encoded URI
 *     (issuer "FrenzPay", account label = the customer's email — so
 *     the entry shows up in their Authenticator app as
 *     "FrenzPay (their@email.com)"). Customer scans, types the first
 *     6-digit code into a verify input, we POST to totp-verify with
 *     mode: 'setup' which commits the secret to MfaSecret + returns
 *     backup codes (shown ONCE).
 *   - Enrolled: confirmation panel + "Disable" button that asks for
 *     a current code before calling /api/auth/mfa/disenroll.
 *
 * After enrolment, the login flow auto-switches from email OTP to
 * TOTP — see /api/auth/login which branches on user.mfaSecrets.length.
 */

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import {
  AlertTriangle, Check, Copy, KeyRound, Loader2, ShieldCheck, Smartphone, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface MfaState { enrolled: boolean; email: string; fullName: string }

export default function CustomerSecurityPage() {
  const [state, setState] = useState<MfaState | null>(null)
  const [loading, setLoading] = useState(true)

  // Enrolment state
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  // Disenrol state
  const [disenrollOpen, setDisenrollOpen] = useState(false)
  const [disenrollCode, setDisenrollCode] = useState('')
  const [disenrolling, setDisenrolling] = useState(false)

  const fetchState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/mfa', { cache: 'no-store' })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Load failed')
      setState({ enrolled: !!json.enrolled, email: json.email, fullName: json.fullName })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchState() }, [fetchState])

  async function startSetup() {
    setSetupLoading(true)
    setBackupCodes(null)
    setVerifyCode('')
    try {
      const res = await fetch('/api/auth/mfa/totp-setup', { method: 'POST' })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Setup failed')
      // Render the QR client-side so we never have to ship the otpauth URI
      // through a separate endpoint.
      const dataUrl = await QRCode.toDataURL(json.uri, { width: 240, margin: 1 })
      setQrDataUrl(dataUrl)
      setOtpauthUri(json.uri)
      setSetupOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Setup failed')
    } finally { setSetupLoading(false) }
  }

  async function confirmSetup() {
    if (verifyCode.length !== 6) return
    setVerifying(true)
    try {
      const res = await fetch('/api/auth/mfa/totp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyCode, mode: 'setup' }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Wrong code')
      setBackupCodes(json.backupCodes ?? [])
      toast.success('Google Authenticator linked')
      // Don't close immediately — the dialog now switches to "save your
      // backup codes" view.
      void fetchState()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wrong code')
      setVerifyCode('')
    } finally { setVerifying(false) }
  }

  async function disenroll() {
    if (disenrollCode.length !== 6) return
    setDisenrolling(true)
    try {
      const res = await fetch('/api/auth/mfa/disenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disenrollCode }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? 'Failed to disable')
      toast.success('Two-factor authentication removed')
      setDisenrollOpen(false)
      setDisenrollCode('')
      void fetchState()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable')
    } finally { setDisenrolling(false) }
  }

  function closeSetup() {
    setSetupOpen(false)
    setQrDataUrl(null)
    setOtpauthUri(null)
    setVerifyCode('')
    setBackupCodes(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-muted-foreground text-sm">Two-factor authentication for your Frenz Pay account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Google Authenticator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading || !state ? (
            <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : state.enrolled ? (
            <>
              <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <AlertDescription>
                  <span className="font-medium">Enabled.</span> When you sign in we&rsquo;ll ask for the 6-digit code from your authenticator instead of emailing you a code.
                </AlertDescription>
              </Alert>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Linked account</p>
                <p className="font-medium">{state.email}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="destructive" onClick={() => setDisenrollOpen(true)}>
                  <Trash2 className="size-4 mr-1.5" /> Disable
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Smartphone className="size-5 text-primary mt-0.5" />
                  <div className="text-sm leading-relaxed">
                    <p className="font-medium">Why turn this on?</p>
                    <p className="text-muted-foreground mt-1">
                      Even if someone gets your password, they still need a 6-digit code from your phone to sign in. Codes work without internet, refresh every 30 seconds, and only your device knows them.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-4 text-sm">
                <p className="text-blue-900 dark:text-blue-200 leading-relaxed">
                  <span className="font-medium">Heads up:</span> the entry in your authenticator app will be labelled <span className="font-mono">FrenzPay ({state.email})</span> &mdash; that&rsquo;s how you&rsquo;ll find it later if you have multiple accounts.
                </p>
              </div>
              <Button onClick={startSetup} disabled={setupLoading} className="w-full sm:w-auto">
                {setupLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <KeyRound className="size-4 mr-2" />}
                Set up Google Authenticator
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Setup dialog ───────────────────────────────────────────────────── */}
      <Dialog open={setupOpen} onOpenChange={(o) => { if (!o) closeSetup() }}>
        <DialogContent className="max-w-md">
          {!backupCodes ? (
            <>
              <DialogHeader>
                <DialogTitle>Scan with your authenticator</DialogTitle>
                <DialogDescription>
                  Open Google Authenticator (or any compatible TOTP app), tap +, then scan this QR. Or paste the secret manually.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {qrDataUrl && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="TOTP QR code" className="rounded-lg border" />
                  </div>
                )}
                {otpauthUri && (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <Label className="text-xs">Or copy this URI</Label>
                    <div className="mt-1 flex gap-2">
                      <code className="flex-1 truncate font-mono text-[11px] text-muted-foreground" title={otpauthUri}>{otpauthUri}</code>
                      <Button size="icon" variant="outline" onClick={() => { void navigator.clipboard.writeText(otpauthUri); toast.success('Copied') }}>
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-code">Enter the current 6-digit code</Label>
                  <Input
                    id="confirm-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="font-mono tracking-widest text-center"
                  />
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={closeSetup} disabled={verifying}>Cancel</Button>
                  <Button onClick={confirmSetup} disabled={verifying || verifyCode.length !== 6}>
                    {verifying && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Confirm + enable
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="size-5 text-emerald-600" /> Save your backup codes
                </DialogTitle>
                <DialogDescription>
                  Each code works once. Use them to sign in if you ever lose your phone. Store them somewhere safe — you won&rsquo;t see them again.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This is the only time these codes will be shown. Save them now.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c, i) => (
                  <code key={i} className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm tracking-widest">{c}</code>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => { void navigator.clipboard.writeText(backupCodes.join('\n')); toast.success('Copied') }}
              >
                <Copy className="size-4 mr-1.5" /> Copy all
              </Button>
              <DialogFooter>
                <Button onClick={closeSetup}>I&rsquo;ve saved them</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Disenrol dialog ────────────────────────────────────────────────── */}
      <Dialog open={disenrollOpen} onOpenChange={(o) => { if (!o) { setDisenrollOpen(false); setDisenrollCode('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Google Authenticator</DialogTitle>
            <DialogDescription>
              Enter a current 6-digit code from your authenticator to confirm. After this, sign-in will fall back to email OTP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={disenrollCode}
              onChange={(e) => setDisenrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="font-mono tracking-widest text-center"
            />
            <Alert variant="destructive" className="text-sm">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Disabling 2FA makes your account easier to take over if your password is compromised. Keep it on if you can.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setDisenrollOpen(false); setDisenrollCode('') }} disabled={disenrolling}>Cancel</Button>
            <Button variant="destructive" onClick={disenroll} disabled={disenrolling || disenrollCode.length !== 6}>
              {disenrolling && <Loader2 className="size-4 mr-2 animate-spin" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
