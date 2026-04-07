'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const signupSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().min(10, 'Please enter a valid phone number'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    referralCode: z.string().optional(),
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

function getPasswordStrength(password: string): {
  level: 'weak' | 'medium' | 'strong'
  percentage: number
  color: string
} {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { level: 'weak', percentage: 33, color: 'bg-destructive' }
  if (score <= 4) return { level: 'medium', percentage: 66, color: 'bg-yellow-500' }
  return { level: 'strong', percentage: 100, color: 'bg-green-500' }
}

export default function SignupPage() {
  const router = useRouter()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showReferral, setShowReferral] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      agreeTerms: false,
      referralCode: '',
    },
  })

  const passwordValue = watch('password') || ''
  const agreeTermsValue = watch('agreeTerms')

  const passwordStrength = useMemo(
    () => getPasswordStrength(passwordValue),
    [passwordValue]
  )

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          full_name: data.fullName,
          referral_code: data.referralCode || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Signup failed')
        return
      }

      toast.success('Account created! Welcome to Frenz Pay.')
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Start receiving global payments in minutes
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="John Doe"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            {...register('fullName')}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </div>

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
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <div className="flex">
            <div className="flex items-center justify-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              +234
            </div>
            <Input
              id="phone"
              type="tel"
              placeholder="8012345678"
              autoComplete="tel"
              className="rounded-l-none"
              aria-invalid={!!errors.phone}
              {...register('phone')}
            />
          </div>
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a strong password"
              autoComplete="new-password"
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
          {passwordValue.length > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                  style={{ width: `${passwordStrength.percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Password strength:{' '}
                <span
                  className={
                    passwordStrength.level === 'weak'
                      ? 'text-destructive'
                      : passwordStrength.level === 'medium'
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }
                >
                  {passwordStrength.level}
                </span>
              </p>
            </div>
          )}
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Referral Code (collapsible) */}
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
                id="referralCode"
                type="text"
                placeholder="Enter referral code (optional)"
                {...register('referralCode')}
              />
            </div>
          )}
        </div>

        {/* Terms Agreement */}
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
            <p className="text-sm text-destructive">{errors.agreeTerms.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-10"
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Create Account
        </Button>
      </form>

      <div className="relative my-6">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
          or continue with
        </span>
      </div>

      <Button
        variant="outline"
        className="w-full h-10"
        onClick={handleGoogleSignup}
        disabled={isGoogleLoading}
      >
        {isGoogleLoading ? (
          <Loader2 className="size-4 animate-spin mr-2" />
        ) : (
          <Chrome className="size-4 mr-2" />
        )}
        Google
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
