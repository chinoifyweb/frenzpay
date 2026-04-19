'use client'

/**
 * /dashboard/withdraw
 *
 * NGN bank withdrawals are temporarily unavailable — the Paystack rail was
 * removed. A replacement provider (Bridge NGN / Yellow Card) will be wired up
 * before this page is re-enabled.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMe } from '@/hooks/use-me'

export default function WithdrawPage() {
  const router = useRouter()
  const { me } = useMe()
  const tier = me?.kycTier ?? 'T0'

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to overview
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Withdraw to Nigerian bank</h1>
        <p className="text-sm text-muted-foreground">
          Send NGN from your wallet to any Nigerian bank account.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-7 w-7" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h2 className="text-lg font-semibold">NGN withdrawals temporarily paused</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;re switching payout providers. Your existing balance stays put &mdash; withdrawals will reopen once the new rail is live.
            </p>
          </div>
          {tier === 'T0' || tier === 'T1' ? (
            <>
              <Badge variant="secondary" className="gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                You&apos;re currently {tier}
              </Badge>
              <p className="text-xs text-muted-foreground max-w-sm">
                In the meantime, finish T2 verification so you&apos;re ready when withdrawals reopen.
              </p>
              <Button asChild>
                <Link href="/dashboard/kyc">{tier === 'T0' ? 'Start verification' : 'Upgrade to T2'}</Link>
              </Button>
            </>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/dashboard/activity">View past withdrawals</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
