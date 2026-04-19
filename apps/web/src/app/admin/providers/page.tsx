'use client'

/**
 * /admin/providers
 *
 * At-a-glance status of every external-provider integration. Shows whether
 * each key is set, a masked tail (last 4 chars) so rotations can be confirmed,
 * and a "Test" button for providers with a cheap read endpoint.
 *
 * No raw secrets ever reach the browser — the API only returns the last-4
 * digits and a boolean `configured`. Rotation requires SSH access to the box,
 * by design.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key as KeyIcon,
  Loader2,
  Lock,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProviderId = 'paystack' | 'bridge' | 'dojah' | 'sentry'
type ProviderStatusValue = 'ok' | 'partial' | 'missing'

interface KeyInfo {
  name: string
  description: string
  configured: boolean
  tail: string | null
  mode: 'live' | 'test' | 'unknown' | null
}

interface ProviderStatus {
  id: ProviderId
  name: string
  purpose: string
  dashboardUrl: string
  keys: KeyInfo[]
  status: ProviderStatusValue
  blocks: string[]
  testable: boolean
}

interface TestResult {
  ok: boolean
  statusCode: number | null
  latencyMs: number
  message: string
  sample?: string
}

const STATUS_TONE: Record<ProviderStatusValue, { badge: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400', label: 'Configured', icon: CheckCircle2 },
  partial: { badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400', label: 'Partial', icon: AlertCircle },
  missing: { badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400', label: 'Not configured', icon: AlertCircle },
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const [testResults, setTestResults] = useState<Record<ProviderId, TestResult | undefined>>({} as Record<ProviderId, TestResult | undefined>)
  const [rotationFor, setRotationFor] = useState<ProviderStatus | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/providers/status', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const json = (await res.json()) as { providers: ProviderStatus[] }
      setProviders(json.providers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  const runTest = useCallback(async (id: ProviderId) => {
    setTesting(id)
    try {
      const res = await fetch('/api/admin/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: id }),
      })
      const json = (await res.json()) as TestResult
      setTestResults((prev) => ({ ...prev, [id]: json }))
      if (json.ok) toast.success(`${id} — ${json.message}`)
      else toast.error(`${id} — ${json.message}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(null)
    }
  }, [])

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Provider Status</h1>
          <p className="text-sm text-muted-foreground">
            External integrations that power payments, KYC, and card issuance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchStatus()} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Provider keys are stored in a server-side <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> file, not in the database. Only the last 4 characters are shown here, so an admin-session hijack doesn&apos;t leak the raw secrets. Rotating a key requires SSH access to the server &mdash; that friction is intentional.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !providers ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : providers ? (
        <div className="space-y-4">
          {providers.map((p) => {
            const tone = STATUS_TONE[p.status]
            const StatusIcon = tone.icon
            const result = testResults[p.id]
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                          {p.name}
                          <Badge variant="secondary" className={tone.badge}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {tone.label}
                          </Badge>
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{p.purpose}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.testable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runTest(p.id)}
                          disabled={testing === p.id}
                        >
                          {testing === p.id ? (
                            <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Testing</>
                          ) : (
                            <><Zap className="mr-1.5 h-3.5 w-3.5" />Test connection</>
                          )}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <a href={p.dashboardUrl} target="_blank" rel="noopener noreferrer">
                          Dashboard
                          <ExternalLink className="ml-1.5 h-3 w-3" />
                        </a>
                      </Button>
                      <Button size="sm" onClick={() => setRotationFor(p)}>
                        <Lock className="mr-1.5 h-3.5 w-3.5" />
                        Rotate
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Keys */}
                  <div className="space-y-2">
                    {p.keys.map((k) => (
                      <div key={k.name} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="font-mono text-sm font-medium">{k.name}</code>
                              {k.mode === 'live' && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-[10px] dark:bg-emerald-500/15 dark:text-emerald-400">
                                  LIVE
                                </Badge>
                              )}
                              {k.mode === 'test' && (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-[10px] dark:bg-yellow-500/15 dark:text-yellow-400">
                                  TEST
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{k.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {k.configured ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              ••••{k.tail ?? '••••'}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400">
                              Not set
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* What breaks when missing */}
                  {p.status !== 'ok' && p.blocks.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
                      <p className="text-xs font-medium text-red-800 dark:text-red-400">Currently blocked:</p>
                      <ul className="mt-1 list-disc pl-4 text-xs text-red-700 dark:text-red-400">
                        {p.blocks.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Last test result */}
                  {result && (
                    <div
                      className={`rounded-lg border p-3 text-xs ${
                        result.ok
                          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                          : 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        <span className="font-medium">{result.message}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-muted-foreground">
                        {result.statusCode !== null && <span>HTTP {result.statusCode}</span>}
                        <span>{result.latencyMs}ms</span>
                        {result.sample && <span>{result.sample}</span>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}

      {/* Rotation instructions modal */}
      <Dialog open={!!rotationFor} onOpenChange={(open) => !open && setRotationFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Rotate {rotationFor?.name} keys</DialogTitle>
          </DialogHeader>
          {rotationFor && (
            <div className="space-y-4 text-sm">
              <p>
                For security, provider secrets are not stored in the database. Rotation happens on the server itself.
              </p>

              <div>
                <p className="mb-2 font-medium">1. Get the new key from {rotationFor.name}</p>
                <Button size="sm" variant="outline" asChild>
                  <a href={rotationFor.dashboardUrl} target="_blank" rel="noopener noreferrer">
                    Open {rotationFor.name} dashboard
                    <ExternalLink className="ml-1.5 h-3 w-3" />
                  </a>
                </Button>
              </div>

              <div>
                <p className="mb-2 font-medium">2. SSH to the server</p>
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  <code className="flex-1 truncate">ssh frenzpay@204.168.249.108</code>
                  <Button size="icon-xs" variant="ghost" onClick={() => copyText('ssh frenzpay@204.168.249.108', 'SSH command')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium">3. Edit the env file</p>
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  <code className="flex-1 truncate">nano /home/frenzpay/shared/.env.production</code>
                  <Button size="icon-xs" variant="ghost" onClick={() => copyText('nano /home/frenzpay/shared/.env.production', 'Edit command')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Update the following key{rotationFor.keys.length > 1 ? 's' : ''}:
                </p>
                <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                  {rotationFor.keys.map((k) => <li key={k.name}>{k.name}</li>)}
                </ul>
              </div>

              <div>
                <p className="mb-2 font-medium">4. Reload the app (zero-downtime)</p>
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  <code className="flex-1 truncate">pm2 reload /home/frenzpay/ecosystem.config.js --update-env</code>
                  <Button size="icon-xs" variant="ghost" onClick={() => copyText('pm2 reload /home/frenzpay/ecosystem.config.js --update-env', 'Reload command')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium">5. Verify</p>
                <p className="text-xs text-muted-foreground">
                  Come back to this page and click <strong>Refresh</strong>. The last-4 of the key should match your new value. If the provider is testable, click <strong>Test connection</strong>.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
