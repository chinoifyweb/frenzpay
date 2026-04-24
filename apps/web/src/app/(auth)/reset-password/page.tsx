'use client'

/**
 * /reset-password?token=...
 *
 * Lands here from the password-reset email. User pastes a new password,
 * we POST to /api/auth/reset-password with { token, newPassword }, and on
 * success we send them to /login with a toast. The token is only valid
 * for 15 minutes and is one-time-use — re-visiting this URL after success
 * or after expiry lands them on the "ask for a new link" path.
 */

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

function passwordStrength(pw: string): { label: string; tone: string; valid: boolean } {
  const checks = [
    pw.length >= 12,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ]
  const passed = checks.filter(Boolean).length
  if (passed < 3) return { label: 'Weak', tone: 'text-red-600', valid: false }
  if (passed < 5) return { label: 'OK, add more variety', tone: 'text-amber-600', valid: false }
  return { label: 'Strong', tone: 'text-emerald-600', valid: true }
}

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const strength = passwordStrength(newPassword)
  const match = newPassword.length > 0 && newPassword === confirm
  const canSubmit = strength.valid && match && token.length >= 32 && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('Missing reset token. Use the link from your email.')
      return
    }
    if (!strength.valid) {
      setError('Please pick a stronger password (12+ chars, mixed case, digit, symbol).')
      return
    }
    if (!match) {
      setError('The two passwords don’t match.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error ?? `Reset failed (${res.status})`)
      }
      setSuccess(true)
      toast.success('Password reset. You can now log in.')
      setTimeout(() => router.push('/login'), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reset failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Bad / missing token landing page
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
              No reset token
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>This page needs a <code>?token=</code> in the URL. Open the reset link from the email we sent you, or request a fresh one:</p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request a new reset link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Password updated</h1>
              <p className="text-sm text-muted-foreground">Taking you to login…</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" />
            Choose a new password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {newPassword && (
                <p className={`text-xs ${strength.tone}`}>{strength.label}</p>
              )}
              <p className="text-xs text-muted-foreground">
                12+ chars, at least one uppercase, lowercase, digit, and symbol.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="font-mono"
              />
              {confirm.length > 0 && !match && (
                <p className="text-xs text-red-600">Passwords don’t match.</p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating</>
              ) : (
                'Update password'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Remember your password?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Back to login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams() requires a Suspense boundary in the Next 15 App Router.
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  )
}
