'use client'

/**
 * /login — customer sign-in.
 *
 * Two-step flow:
 *   1. Email + password → POST /api/auth/login
 *      Server validates, mints a `challengeToken`, emails a 6-digit OTP,
 *      and responds { requiresOtp: true, challengeToken, emailHint, expiresAt }.
 *      No session is set yet.
 *   2. OTP → POST /api/auth/login/verify-otp { challengeToken, code }
 *      Server verifies the code against the Redis-stored hash, mints
 *      session cookie, returns user.
 *
 * Resend: POST /api/auth/login/resend-otp { challengeToken } — capped
 * at 3 per challenge window.
 */

import { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, Mail, ShieldCheck } from 'lucide-react'
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

  // ── OTP step state ────────────────────────────────────────────────────────
  // mfaMethod tells us which UI + verify endpoint to use:
  //   'totp'  → user has Google Authenticator enrolled; show "Enter the
  //             6-digit code from your authenticator app", verify against
  //             /api/auth/mfa/totp-verify (mode: challenge)
  //   'email' → fall-back; show "Code sent to ...@x.com", verify against
  //             /api/auth/login/verify-otp
  const [otpStep, setOtpStep] = useState(false)
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('email')
  const [challengeToken, setChallengeToken] = useState('')
  const [emailHint, setEmailHint] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number>(600) // 10 min

  // Tick the countdown every second while we're on the OTP step.
  useEffect(() => {
    if (!otpStep) return
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [otpStep])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // ── Step 1: email + password ────────────────────────────────────────────────

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
        toast.error(json.error || 'Login failed')
        return
      }

      if (json.requiresOtp) {
        const method: 'totp' | 'email' = json.mfaMethod === 'totp' ? 'totp' : 'email'
        setMfaMethod(method)
        setChallengeToken(json.challengeToken)
        setEmailHint(json.emailHint ?? data.email)
        setOtpStep(true)
        // TOTP windows are 30s — give the user 5 min total. Email path
        // still gets 10 min as before.
        setSecondsLeft(method === 'totp' ? 300 : 600)
        if (method === 'totp') toast.success('Open Google Authenticator to get your code')
        else toast.success(`Code sent to ${json.emailHint ?? data.email}`)
        return
      }

      // Defensive fallback — shouldn't happen now that OTP is mandatory,
      // but if the server ever short-circuits, just route to dashboard.
      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: verify OTP ──────────────────────────────────────────────────────

  async function verifyOtp(code: string) {
    if (code.length !== 6) return
    setOtpLoading(true)
    try {
      // Different endpoint per method. TOTP goes through the existing
      // mfa/totp-verify (mode: 'challenge'); email OTP through our
      // login/verify-otp built in this round.
      const url = mfaMethod === 'totp'
        ? '/api/auth/mfa/totp-verify'
        : '/api/auth/login/verify-otp'
      const body = mfaMethod === 'totp'
        ? { token: code, challengeToken, mode: 'challenge' }
        : { challengeToken, code }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Invalid code')
        setOtpCode('')
        if (res.status === 410) {
          // Challenge expired — kick back to step 1.
          setOtpStep(false)
          setChallengeToken('')
        }
        return
      }
      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch {
      toast.error('Verification failed. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  async function resendOtp() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/login/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Could not resend code')
        return
      }
      setOtpCode('')
      setSecondsLeft(600)
      toast.success(
        json.resendsRemaining === 0
          ? 'New code sent. No more resends available.'
          : 'New code sent.',
      )
    } catch {
      toast.error('Resend failed. Try signing in again.')
    } finally {
      setResending(false)
    }
  }

  // ── Render: OTP step ───────────────────────────────────────────────────────

  if (otpStep) {
    const mins = Math.floor(secondsLeft / 60)
    const secs = secondsLeft % 60
    return (
      <div>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          {mfaMethod === 'totp' ? <ShieldCheck className="size-6 text-primary" /> : <Mail className="size-6 text-primary" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {mfaMethod === 'totp' ? 'Authenticator code' : 'Check your email'}
        </h1>
        <p className="text-muted-foreground mt-1 mb-6">
          {mfaMethod === 'totp' ? (
            <>Open Google Authenticator and enter the 6-digit code shown next to <span className="font-medium text-foreground">{emailHint}</span>.</>
          ) : (
            <>We sent a 6-digit code to <span className="font-medium text-foreground">{emailHint}</span>. Enter it below to finish signing in.</>
          )}
        </p>

        <div className="flex justify-center mb-4">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={(v) => {
              setOtpCode(v)
              if (v.length === 6) {
                // Auto-submit a moment after the last digit so the user
                // sees it land in the box before the spinner kicks in.
                setTimeout(() => { void verifyOtp(v) }, 80)
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

        <p className="mb-4 text-center text-xs text-muted-foreground">
          {secondsLeft > 0
            ? `Code expires in ${mins}:${String(secs).padStart(2, '0')}`
            : 'Code expired — request a new one.'}
        </p>

        <Button
          className="w-full h-10"
          onClick={() => void verifyOtp(otpCode)}
          disabled={otpCode.length !== 6 || otpLoading}
        >
          {otpLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Verify and sign in
        </Button>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOtpStep(false)
              setChallengeToken('')
              setOtpCode('')
            }}
          >
            ← Use a different email
          </button>
          {mfaMethod === 'email' && (
            <button
              type="button"
              className="text-primary hover:underline disabled:opacity-50"
              onClick={() => void resendOtp()}
              disabled={resending}
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <ShieldCheck className="inline size-3 mr-1 align-text-bottom" />
          We require this every time to keep your account safe.
        </p>
      </div>
    )
  }

  // ── Render: email + password ───────────────────────────────────────────────

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
          Continue
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
