'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Gift, Share2, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { APP_URL } from '@/lib/constants'
import { useMe } from '@/hooks/use-me'
import { toast } from 'sonner'

/**
 * Referrals are not live yet — this page previews the flow using the user's
 * FrenzTag as the referral code so there is no hardcoded mock identity. When
 * the backend ships, the table + stats will be sourced from /api/referrals.
 */
export default function ReferralsPage() {
  const { me, loading } = useMe()
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const tag = me?.frenzTag?.tag ?? ''
  const code = tag ? `FRZ-${tag.toUpperCase()}` : ''
  const link = tag ? `${APP_URL}/signup?ref=${code}` : ''

  async function copy(value: string, kind: 'code' | 'link') {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      toast.success(`${kind === 'code' ? 'Code' : 'Link'} copied`)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Refer &amp; earn</h1>
        <p className="text-sm text-muted-foreground">
          Invite friends to FrenzPay. Earn when they verify and transact.
        </p>
      </div>

      <Alert>
        <Gift className="h-4 w-4" />
        <AlertDescription>
          Referrals launch soon. Your code is reserved &mdash; share it now, rewards backfill when the programme goes live.
        </AlertDescription>
      </Alert>

      {/* Referral code card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Your referral code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : !tag ? (
            <Alert>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>Set up your FrenzTag first to unlock a referral code.</span>
                <Button size="sm" asChild variant="outline">
                  <Link href="/dashboard/settings">Set FrenzTag</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-mono text-2xl font-semibold tracking-wider">{code}</p>
                <Button size="sm" variant="outline" onClick={() => copy(code, 'code')}>
                  {copied === 'code' ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  Copy code
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-xs">{link}</p>
                <Button size="sm" onClick={() => copy(link, 'link')}>
                  {copied === 'link' ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}
                  Copy link
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats — placeholders until backend is wired */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Referrals', value: '0', Icon: Users, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
          { label: 'Earned', value: '$0.00', Icon: Gift, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
          { label: 'Pending', value: '$0.00', Icon: Gift, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
        ].map(({ label, value, Icon, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-5">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How it will work */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it will work</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">1</Badge>
              <span>Share your code with a friend.</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">2</Badge>
              <span>They sign up, verify KYC, and complete their first transaction.</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">3</Badge>
              <span>You both get a bonus credited to your USD balance.</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
