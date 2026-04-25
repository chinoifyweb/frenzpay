'use client'

/**
 * /admin-login
 *
 * Dedicated admin login page — NOT the customer /login. Credentials match
 * the admin_users table, and the session it creates is strictly admin-scope
 * (role='admin'). Redirects to /admin on success.
 *
 * Lives at /admin-login (not /admin/login) on purpose, so it sits outside
 * the /admin/* middleware-gated namespace and can be reached without a
 * session.
 */

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Shield,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

function AdminLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Login failed (${res.status})`)
      toast.success('Signed in')
      router.push(next.startsWith('/admin') ? next : '/admin')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-orange-950/20 dark:via-background dark:to-red-950/20 p-4">
      {/* Admin accent strip */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-orange-600 to-red-600" />

      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-orange-600">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="text-lg font-semibold leading-tight text-foreground">FrenzPay</p>
            <p className="text-xs font-medium uppercase tracking-wider text-orange-600">Admin</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Restricted area. Use your admin credentials.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 font-mono"
                  required
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPw((s) => !s)}
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in</>
              ) : (
                <><Lock className="mr-2 h-4 w-4" />Sign in to admin</>
              )}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Not an admin?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Customer sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Suspicious sign-in activity is logged and reviewed.
        </p>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginInner />
    </Suspense>
  )
}
