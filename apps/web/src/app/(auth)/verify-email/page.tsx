'use client'

/**
 * Static info page shown after signup.
 * The actual email OTP verification happens inside the signup flow (signup/page.tsx).
 * This page is for standalone deep-links like /verify-email from an email link.
 */

import Link from 'next/link'
import { Mail, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Mail className="size-8 text-primary" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>

      <p className="text-muted-foreground mt-3 mb-2 max-w-sm mx-auto">
        We&apos;ve sent a verification code to your email address.
        Enter it on the signup page to continue.
      </p>

      <p className="text-sm text-muted-foreground mb-8">
        The code expires in 10 minutes.
      </p>

      <Link href="/signup">
        <Button variant="outline" className="w-full h-10">← Back to signup</Button>
      </Link>

      <div className="mt-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-3" />
          Already verified? Log in
        </Link>
      </div>
    </div>
  )
}
