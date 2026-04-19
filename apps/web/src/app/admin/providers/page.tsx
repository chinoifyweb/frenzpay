'use client'

/**
 * /admin/providers
 *
 * At-a-glance status of every external-provider integration. Shows whether
 * each key is set, a masked tail (last 4 chars) so rotations can be confirmed,
 * lets an admin paste a new value (server-side only writes to .env +
 * auto-reloads PM2), and provides a "Test" button for providers with a cheap
 * read endpoint.
 *
 * Raw keys never travel back to the browser — the status API only returns
 * last-4 + configured boolean. Saving is one-way: browser → server → .env.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Key as KeyIcon,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

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

/**
 * One editable row per key. Keeps its own edit/show/save state so sibling
 * rows don't force remount on every keystroke.
 */
function KeyRow({ k, onSaved }: { k: KeyInfo; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = value.trim()
    if (trimmed.length < 8) {
      toast.error('Value looks too short. Paste the full key.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/providers/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: k.name, value: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`)
      toast.success(`${k.name} saved. PM2 reloading…`)
      setValue('')
      setEditing(false)
      // The server schedules a reload ~750ms after responding — wait a bit
      // before refreshing so the new status reflects the new key.
      setTimeout(onSaved, 6000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {k.configured ? 'Replace' : 'Set'}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-2">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={k.configured ? 'Paste the new value' : 'Paste the key'}
              className="pr-10 font-mono text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !saving && save()}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide' : 'Show'}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Value is sent directly to the server, written to .env with mode 0600, and the app auto-reloads. Never stored in the database.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue('') }} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving || value.trim().length < 8}>
                {saving ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving</>
                ) : (
                  <><Save className="mr-1.5 h-3.5 w-3.5" />Save</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
          Keys are saved to a server-side <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> file (never the database), and only the last 4 characters are ever shown back. Saving triggers an automatic zero-downtime PM2 reload &mdash; the new key is live in about 5 seconds.
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
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Keys */}
                  <div className="space-y-2">
                    {p.keys.map((k) => (
                      <KeyRow key={k.name} k={k} onSaved={() => void fetchStatus()} />
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
    </div>
  )
}
