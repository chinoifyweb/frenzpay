'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase'

const COOLDOWN_SECONDS = 60

export default function VerifyEmailPage() {
  const [isResending, setIsResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldown])

  const handleResend = useCallback(async () => {
    setIsResending(true)
    try {
      const supabase = createClient()

      // Get the current session to find the user's email
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user?.email) {
        toast.error(
          'Unable to determine your email address. Please try signing up again.'
        )
        return
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: session.user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Verification email sent! Please check your inbox.')
      setCooldown(COOLDOWN_SECONDS)
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsResending(false)
    }
  }, [])

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Mail className="size-8 text-primary" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>

      <p className="text-muted-foreground mt-3 mb-2 max-w-sm mx-auto">
        We&apos;ve sent a verification link to your email address. Click the link
        to verify your account and get started.
      </p>

      <p className="text-sm text-muted-foreground mb-8">
        The link will expire in 24 hours.
      </p>

      <Button
        variant="outline"
        className="w-full h-10"
        onClick={handleResend}
        disabled={isResending || cooldown > 0}
      >
        {isResending ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Sending...
          </>
        ) : cooldown > 0 ? (
          `Resend email in ${cooldown}s`
        ) : (
          'Resend verification email'
        )}
      </Button>

      <div className="mt-6">
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
