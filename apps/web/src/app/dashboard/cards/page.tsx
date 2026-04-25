'use client'

/**
 * /dashboard/cards
 *
 * "Select card type" landing — modelled on Grey's design. The customer
 * picks Virtual (active, links into the Graph card management page) or
 * Physical (greyed out with a "Coming soon" pill). The previous detailed
 * Bridge card management UI was retired here — Bridge-issued cards
 * still work via /api/cards but new cards all go through the Graph rail
 * at /dashboard/cards/graph.
 */

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, CreditCard, Lock } from 'lucide-react'
import { useMe } from '@/hooks/use-me'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export default function CardsLandingPage() {
  const { me, loading } = useMe()
  const tier = me?.kycTier ?? 'T0'
  const isVerified = tier === 'T2' || tier === 'T3'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cards</h1>
        <p className="text-muted-foreground text-sm">Spend your USD balance anywhere Visa or Mastercard is accepted.</p>
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : !isVerified ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="size-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Cards unlock after KYC</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Verify your identity first — we issue virtual debit cards once your KYC is approved.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/kyc">Start KYC</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Virtual card — active */}
          <Link
            href="/dashboard/cards/graph"
            className="group rounded-2xl border bg-card p-5 transition-all hover:border-primary hover:shadow-md focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <CardArt active />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-base font-semibold">Virtual card</p>
                <p className="text-xs text-muted-foreground">Spend online, fund from your USD balance</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>

          {/* Physical card — coming soon, non-interactive */}
          <div
            aria-disabled="true"
            className="rounded-2xl border bg-muted/40 p-5 opacity-80 cursor-not-allowed"
          >
            <CardArt />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-muted-foreground">Physical card</p>
                <p className="text-xs text-muted-foreground">Tap-to-pay anywhere Visa works</p>
              </div>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Coming soon</Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Stylised card artwork. Active = inky gradient with "FrenzPay" + Visa-ish
 *  brand tag; disabled = washed-out grey for the Coming-soon variant. */
function CardArt({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`relative aspect-[16/10] w-full overflow-hidden rounded-xl shadow-sm ${
        active
          ? 'bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white'
          : 'bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-200 text-zinc-400 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-800 dark:text-zinc-500'
      }`}
    >
      {active && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.25),transparent_55%)]" />
      )}
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${active ? '' : 'opacity-60'}`}>
            FrenzPay
          </span>
          <CreditCard className="size-4 opacity-80" />
        </div>
        <div className="font-mono text-[13px] tracking-[0.32em] opacity-90">
          •••• •••• •••• {active ? '••••' : '----'}
        </div>
      </div>
    </div>
  )
}
