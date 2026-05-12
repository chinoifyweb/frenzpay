'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useMe, formatDisplayName } from '@/hooks/use-me'

export default function SettingsPage() {
  const router = useRouter()
  const { me, loading, refresh } = useMe()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedTag, setCopiedTag] = useState(false)

  useEffect(() => {
    if (!me) return
    setFirstName(me.firstName ?? '')
    setLastName(me.lastName ?? '')
    setDisplayName(me.displayName ?? '')
  }, [me])

  const dirty =
    me !== null &&
    (firstName !== (me.firstName ?? '') ||
      lastName !== (me.lastName ?? '') ||
      displayName !== (me.displayName ?? ''))

  async function saveProfile() {
    if (!dirty) return
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, displayName }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) {
        const first = json?.fields ? (Object.values(json.fields).flat()[0] as string | undefined) : undefined
        throw new Error(first ?? json.error ?? 'Save failed')
      }
      toast.success('Profile updated')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) throw new Error()
      router.push('/login')
      router.refresh()
    } catch {
      toast.error('Logout failed')
    }
  }

  async function copyTag() {
    if (!me?.frenzTag?.tag) return
    try {
      await navigator.clipboard.writeText(`@${me.frenzTag.tag}`)
      setCopiedTag(true)
      toast.success('FrenzTag copied')
      setTimeout(() => setCopiedTag(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>
            We couldn&apos;t load your profile. Please <Link href="/login" className="underline">log in again</Link>.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, security, and account preferences.
        </p>
      </div>

      {/* Identity summary */}
      <Card>
        <CardContent className="p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-semibold">
              {(firstName[0] ?? me.email[0] ?? '?').toUpperCase()}
              {(lastName[0] ?? '').toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{formatDisplayName(me)}</p>
                {me.emailVerified && (
                  <BadgeCheck className="h-4 w-4 text-sky-500" aria-label="Email verified" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{me.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{me.kycTier}</Badge>
                <Badge
                  variant="secondary"
                  className={
                    me.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400'
                  }
                >
                  {me.status}
                </Badge>
                {me.frenzTag?.tag && (
                  <button
                    onClick={copyTag}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono hover:bg-muted"
                    aria-label="Copy FrenzTag"
                  >
                    @{me.frenzTag.tag}
                    {copiedTag ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-60" />}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-right text-xs text-muted-foreground">
            <span>Member since</span>
            <span className="font-medium text-foreground">
              {new Date(me.createdAt).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Profile (editable) */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How we address you in the app"
            />
            <p className="text-xs text-muted-foreground">
              Shown on receipts and in the top-right of the dashboard.
            </p>
          </div>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Email
              </Label>
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{me.email}</p>
                {me.emailVerified ? (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Unverified</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Contact support to change your email.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Phone
              </Label>
              <p className="font-medium">Stored encrypted</p>
              <p className="text-xs text-muted-foreground">
                Re-verified during KYC (BVN/NIN cross-check) rather than by SMS.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
            <Button disabled={!dirty || saving} onClick={saveProfile}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="flex items-center justify-between py-4 first:pt-0">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">
                  Use a unique, long password. Change it if you suspect compromise.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild><Link href="/forgot-password">Reset</Link></Button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-start gap-3">
              <Fingerprint className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Two-factor authentication
                  {me.mfaRequired && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">Enabled</Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Protect your account with a TOTP app.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled>{me.mfaRequired ? 'Manage' : 'Enable'}</Button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Identity verification (KYC)</p>
                <p className="text-xs text-muted-foreground">
                  {me.kycTier === 'T0'
                    ? 'Complete KYC to unlock transfers, cards, and withdrawals.'
                    : `You are ${me.kycTier} verified. Upgrade tiers unlock higher limits.`}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/kyc">{me.kycTier === 'T0' ? 'Start' : 'Manage'}</Link>
            </Button>
          </div>

          <div className="flex items-center justify-between py-4 last:pb-0">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-medium">Freeze my account</p>
                <p className="text-xs text-muted-foreground">
                  Immediately lock your account if you suspect unauthorised access.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" disabled>Freeze</Button>
          </div>
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">
              Ends this browser session. You can log back in with your email + password.
            </p>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
