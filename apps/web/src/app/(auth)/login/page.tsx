'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false)
  const [challengeToken, setChallengeToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [isMfaLoading, setIsMfaLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // ── Step 1: Password login ─────────────────────────────────────────────────

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const json = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(json.error || 'Too many attempts. Please try again later.')
        } else if (res.status === 403) {
          toast.error(json.error || 'Account restricted.')
        } else {
          toast.error(json.error || 'Login failed')
        }
        return
      }

      // MFA required
      if (json.mfaRequired) {
        setChallengeToken(json.challengeToken)
        setMfaRequired(true)
        return
      }

      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: TOTP verification ──────────────────────────────────────────────

  async function verifyMfa() {
    if (totpCode.length !== 6) return
    setIsMfaLoading(true)
    try {
      const res = await fetch('/api/auth/mfa/totp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: totpCode,
          challengeToken,
          mode: 'challenge',
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Invalid code')
        setTotpCode('')
        return
      }

      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch {
      toast.error('Verification failed. Please try again.')
    } finally {
      setIsMfaLoading(false)
    }
  }

  // ── Render: MFA step ───────────────────────────────────────────────────────

  if (mfaRequired) {
    return (
      <div>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Two-factor authentication</h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Enter the 6-digit code from your authenticator app.
        </p>

        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={totpCode}
            onChange={(v) => {
              setTotpCode(v)
              // Auto-submit when all 6 digits entered
              if (v.length === 6) {
                setTimeout(() => {
                  void (async () => {
                    setIsMfaLoading(true)
                    const res = await fetch('/api/auth/mfa/totp-verify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ token: v, challengeToken, mode: 'challenge' }),
                    })
                    const json = await res.json()
                    setIsMfaLoading(false)
                    if (!res.ok) {
                      toast.error(json.error || 'Invalid code')
                      setTotpCode('')
                      return
                    }
                    toast.success('Welcome back!')
                    router.push(redirectTo)
                    router.refresh()
                  })()
                }, 100)
              }
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          className="w-full h-10"
          onClick={verifyMfa}
          disabled={totpCode.length !== 6 || isMfaLoading}
        >
          {isMfaLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Verify
        </Button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setMfaRequired(false)
              setChallengeToken('')
              setTotpCode('')
            }}
          >
            ← Back to login
          </button>
        </p>
      </div>
    )
  }

  // ── Render: Login form ─────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="text-muted-foreground mt-1 mb-6">Log in to your Frenz Pay account</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-10" disabled={isLoading}>
          {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Log In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
