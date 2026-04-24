'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, ChevronDown, Check, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

// ─── Step definitions ─────────────────────────────────────────────────────────

type Step = 'form' | 'verify_email'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const signupSchema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    middleName: z
      .string()
      .min(2, 'Middle name must be at least 2 characters as on your ID')
      .max(60, 'Middle name is too long'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/, 'Please enter a valid phone number'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .refine((v) => /[A-Z]/.test(v), 'Must contain an uppercase letter')
      .refine((v) => /[a-z]/.test(v), 'Must contain a lowercase letter')
      .refine((v) => /[0-9]/.test(v), 'Must contain a number')
      .refine((v) => /[^A-Za-z0-9]/.test(v), 'Must contain a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    agreeTerms: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.agreeTerms === true, {
    message: 'You must agree to the Terms of Service and Privacy Policy',
    path: ['agreeTerms'],
  })

type SignupFormData = z.infer<typeof signupSchema>

// ─── Password strength ────────────────────────────────────────────────────────

function getPasswordStrength(password: string) {
  let score = 0
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { level: 'weak', pct: 33, color: 'bg-destructive' }
  if (score <= 4) return { level: 'medium', pct: 66, color: 'bg-yellow-500' }
  return { level: 'strong', pct: 100, color: 'bg-green-500' }
}

// ─── Normalize phone to E.164 ─────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return `+${digits}`
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`
  if (digits.length === 10) return `+234${digits}`
  return `+${digits}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('form')
  const [userId, setUserId] = useState<string>('')
  const [emailOtp, setEmailOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { agreeTerms: false },
  })

  const passwordValue = watch('password') || ''
  const agreeTermsValue = watch('agreeTerms')
  const strength = useMemo(() => getPasswordStrength(passwordValue), [passwordValue])

  // ── Step 1: Submit signup form ─────────────────────────────────────────────

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true)
    try {
      const phone = normalizePhone(data.phone)
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          phone,
          password: data.password,
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          agreedToTerms: data.agreeTerms,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Signup failed')
        return
      }

      setUserId(json.userId)
      setStep('verify_email')
      toast.success('Account created! Enter the 6-digit code sent to your email.')

      // Dev: auto-fill OTPs
      if (json._devEmailOtp) setEmailOtp(json._devEmailOtp)
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Verify email OTP ───────────────────────────────────────────────

  async function verifyEmail() {
    if (emailOtp.length !== 6) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp: emailOtp }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Verification failed')
        return
      }

      // SMS verification removed — email is the only gate now.
      toast.success('Email verified! Welcome to Frenz Pay.')
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('Verification failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Resend email OTP ────────────────────────────────────────────────────────

  async function resendEmailOtp() {
    setIsResending(true)
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'email' }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to resend')
        return
      }

      toast.success('New code sent to your email.')
      if (json._devOtp) setEmailOtp(json._devOtp)
    } catch {
      toast.error('Failed to resend. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  // ── Render: email OTP verification ─────────────────────────────────────────

  if (step === 'verify_email') {
    return (
      <div>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Enter the 6-digit code sent to your email address.
          {process.env.NODE_ENV !== 'production' && (
            <span className="block text-xs text-yellow-600 mt-1">
              [Dev] Check network response or auto-filled above.
            </span>
          )}
        </p>

        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={emailOtp} onChange={setEmailOtp}>
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
          onClick={verifyEmail}
          disabled={emailOtp.length !== 6 || isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : (
            <Check className="size-4 mr-2" />
          )}
          Verify
        </Button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Didn&apos;t receive the code?{' '}
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            onClick={resendEmailOtp}
            disabled={isResending}
          >
            {isResending ? 'Sending…' : 'Resend'}
          </button>
        </p>
      </div>
    )
  }

  // ── Render: Signup form ────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Start receiving global payments in minutes
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name row — first / middle / last. All three are required because
            our virtual account issuer (Graph) will not onboard a customer
            without a middle name on file. Use the name as it appears on the
            government-issued ID you'll upload during KYC. */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              type="text"
              placeholder="John"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...register('firstName')}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="middleName">Middle Name</Label>
            <Input
              id="middleName"
              type="text"
              placeholder="Samuel"
              autoComplete="additional-name"
              aria-invalid={!!errors.middleName}
              {...register('middleName')}
            />
            {errors.middleName && (
              <p className="text-xs text-destructive">{errors.middleName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              type="text"
              placeholder="Doe"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              {...register('lastName')}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Use your exact legal names as they appear on your government-issued ID.
        </p>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+2348012345678"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            {...register('phone')}
          />
          <p className="text-xs text-muted-foreground">
            Include country code (e.g. +234 for Nigeria)
          </p>
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="12+ characters"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {passwordValue.length > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Strength:{' '}
                <span
                  className={
                    strength.level === 'weak'
                      ? 'text-destructive'
                      : strength.level === 'medium'
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }
                >
                  {strength.level}
                </span>
              </p>
            </div>
          )}
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Repeat password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
              aria-label="Toggle password visibility"
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Referral code (collapsible) */}
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowReferral(!showReferral)}
          >
            <ChevronDown
              className={`size-4 transition-transform ${showReferral ? 'rotate-180' : ''}`}
            />
            Have a referral code?
          </button>
          {showReferral && (
            <div className="mt-2">
              <Input
                type="text"
                placeholder="Referral code (optional)"
                {...register('referralCode' as keyof SignupFormData)}
              />
            </div>
          )}
        </div>

        {/* Terms */}
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Checkbox
              id="agreeTerms"
              checked={agreeTermsValue}
              onCheckedChange={(checked: boolean) => setValue('agreeTerms', checked)}
              className="mt-0.5"
            />
            <label htmlFor="agreeTerms" className="text-sm text-muted-foreground leading-snug">
              I agree to the{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
          {errors.agreeTerms && (
            <p className="text-xs text-destructive">{errors.agreeTerms.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-10" disabled={isLoading}>
          {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Create Account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
