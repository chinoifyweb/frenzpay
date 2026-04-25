'use client'

/**
 * /dashboard/accounts
 *
 * Verified-customer landing for virtual accounts. Two sections:
 *
 *   1. Currently active accounts — listed with their bank details so the
 *      customer can copy + share with payers.
 *   2. Request CTAs — for each currency the customer doesn't yet have
 *      an APPROVED account on, a card that drops them into the 3-step
 *      request wizard at /dashboard/accounts/request/[currency]. Cards
 *      with an in-flight request show a "Pending review" badge instead.
 *
 * Replaces the previous redirect to /dashboard/wallet/receive — that
 * page is still useful for receive-flow specifics, but customers
 * looking for "Apply for USD account" land here first.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, CheckCircle2, Globe, Landmark, Loader2 } from 'lucide-react'
import { useMe } from '@/hooks/use-me'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ExternalAccount {
  id: string
  currency: string
  type: string
  accountName: string | null
  accountNumber: string | null
  routingNumber: string | null
  bankName: string | null
  status: string
}

interface AccountRequest {
  id: string
  currency: string
  // PROCESSING = admin atomically claimed the row to start provisioning;
  // from the customer's POV it's still "in review", same UX as PENDING.
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED'
  rejectionReason: string | null
  submittedAt: string
}

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar account', flag: '🇺🇸', tone: 'from-emerald-500/10 to-emerald-500/0' },
  { code: 'EUR', label: 'Euro account',      flag: '🇪🇺', tone: 'from-sky-500/10 to-sky-500/0' },
  { code: 'NGN', label: 'Naira account',     flag: '🇳🇬', tone: 'from-green-600/10 to-green-600/0' },
] as const

export default function AccountsPage() {
  const { me, loading: meLoading } = useMe()
  const [externals, setExternals] = useState<ExternalAccount[]>([])
  const [requests, setRequests] = useState<AccountRequest[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [extRes, reqRes] = await Promise.all([
        fetch('/api/accounts/external', { cache: 'no-store' }),
        fetch('/api/account-requests', { cache: 'no-store' }),
      ])
      if (extRes.ok) {
        const j = await extRes.json()
        setExternals(j.accounts ?? [])
      }
      if (reqRes.ok) {
        const j = await reqRes.json()
        setRequests(j.requests ?? [])
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Per currency: do we have an APPROVED virtual account, a PENDING
  // request, or nothing at all?
  const stateByCurrency = useMemo(() => {
    const m: Record<string, 'approved' | 'pending' | 'rejected' | 'none'> = {}
    for (const c of CURRENCIES) m[c.code] = 'none'
    for (const ea of externals) {
      if (ea.status === 'active') m[ea.currency] = 'approved'
    }
    for (const r of requests) {
      if (m[r.currency] === 'approved') continue // accepted wins
      if (r.status === 'PENDING' || r.status === 'PROCESSING') m[r.currency] = 'pending'
      else if (r.status === 'REJECTED' && m[r.currency] === 'none') m[r.currency] = 'rejected'
    }
    return m
  }, [externals, requests])

  const tier = me?.kycTier ?? 'T0'
  const isVerified = tier === 'T2' || tier === 'T3'

  if (meLoading || loading) {
    return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <p className="text-muted-foreground text-sm">Virtual bank accounts for receiving payments in different currencies.</p>
      </div>

      {!isVerified && (
        <Alert>
          <Landmark className="h-4 w-4" />
          <AlertDescription>
            Verify your identity first &mdash; virtual accounts are only available once your KYC is approved.
            <Button asChild size="sm" variant="link" className="ml-2 px-0">
              <Link href="/dashboard/kyc">Start KYC →</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Existing approved accounts */}
      {externals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your accounts</h2>
          {externals.map((ea) => (
            <Card key={ea.id}>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ea.currency}</Badge>
                    <p className="font-medium text-sm">{ea.bankName ?? 'Virtual bank account'}</p>
                  </div>
                  <Badge variant="outline" className="gap-1.5"><CheckCircle2 className="size-3 text-emerald-600" />Active</Badge>
                </div>
                <div className="grid gap-1 text-sm">
                  <p><span className="text-muted-foreground">Account name:</span> <span className="font-mono">{ea.accountName ?? '—'}</span></p>
                  <p><span className="text-muted-foreground">Account number:</span> <span className="font-mono">{ea.accountNumber ?? '—'}</span></p>
                  {ea.routingNumber && (
                    <p><span className="text-muted-foreground">Routing:</span> <span className="font-mono">{ea.routingNumber}</span></p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Request cards */}
      {isVerified && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Available currencies</h2>
          {CURRENCIES.map((c) => {
            const state = stateByCurrency[c.code]
            if (state === 'approved') return null // already shown above
            return (
              <Card key={c.code} className={`bg-gradient-to-br ${c.tone}`}>
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{c.flag}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {state === 'pending'
                          ? 'Application under review — usually under 24 hours.'
                          : state === 'rejected'
                            ? 'Previous application was declined — you can reapply.'
                            : `Receive payments in ${c.code} from anywhere in the world.`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {state === 'pending' ? (
                      <Badge variant="secondary" className="gap-1.5"><Clock className="size-3" />Pending review</Badge>
                    ) : (
                      <Button asChild size="sm">
                        <Link href={`/dashboard/accounts/request/${c.code}`}>
                          {state === 'rejected' ? 'Reapply' : `Request ${c.code} account`}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Globe className="size-3" />
        Account approvals are reviewed manually by our compliance team.
      </p>
    </div>
  )
}
