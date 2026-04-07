'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordFormData) {
    setIsLoading(true)
    try {
      // Password reset email — always show success to prevent email enumeration
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      })
      setSubmittedEmail(data.email)
      setIsSuccess(true)
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Mail className="size-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          We&apos;ve sent a password reset link to{' '}
          <span className="font-medium text-foreground">{submittedEmail}</span>.
          Click the link in the email to reset your password.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Didn&apos;t receive the email? Check your spam folder or try again.
        </p>
        <Button
          variant="outline"
          className="w-full h-10"
          onClick={() => setIsSuccess(false)}
        >
          Try a different email
        </Button>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-3" />
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Enter your email address and we&apos;ll send you a link to reset your
        password.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

        <Button
          type="submit"
          className="w-full h-10"
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
          Send Reset Link
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-3" />
          Back to login
        </Link>
      </div>
    </div>
  )
}
