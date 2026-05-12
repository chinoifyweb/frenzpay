'use client'

/**
 * /admin/accounts — Provisioned virtual accounts.
 *
 * Lists every UserExternalAccount of type='virtual_account' across
 * USD/EUR/NGN with the upstream account number, bank name, status,
 * and a Refresh button per row that re-fetches from Graph (useful
 * right after provisioning when the rail hasn't yet populated the
 * account number).
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Search, Wallet, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface VirtualAccount {
  id: string
  provider: string
  externalAccountId: string | null
  currency: 'USD' | 'EUR' | 'NGN' | string
  accountName: string | null
  accountNumber: string | null
  routingNumber: string | null
  bankName: string | null
  status: string
  createdAt: string
  user: {
    id: string
    email: string
    displayName: string
    kycTier: string
  }
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  closed: 'bg-muted text-muted-foreground',
}

export default function AdminAccountsPage() {
  const [rows, setRows] = useState<VirtualAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<'ALL' | 'USD' | 'EUR' | 'NGN'>('ALL')
  const [status, setStatus] = useState<string>('ALL')
  const [q, setQ] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '100' })
      if (currency !== 'ALL') p.set('currency', currency)
      if (status !== 'ALL') p.set('status', status)
      if (q.trim()) p.set('q', q.trim())
      const res = await fetch(`/api/admin/accounts?${p}`, { cache: 'no-store' })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = (await res.json().catch(() => null)) ?? {}
      setRows(json.accounts ?? [])
      setTotal(json.pagination?.total ?? 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [currency, status, q])

  useEffect(() => { fetchList() }, [fetchList])

  async function refresh(id: string) {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/admin/accounts/${id}/refresh`, { method: 'POST' })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      const json = (await res.json().catch(() => null)) ?? {}
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      // Patch the row in place
      setRows(prev => prev.map(r => r.id === id ? {
        ...r,
        status: json.status,
        accountName: json.accountName ?? r.accountName,
        accountNumber: json.accountNumber ?? r.accountNumber,
        routingNumber: json.routingNumber ?? r.routingNumber,
        bankName: json.bankName ?? r.bankName,
      } : r))
      toast.success(json.accountNumber
        ? 'Bank details fetched.'
        : `Status: ${json.status}. Bank details not yet ready.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshingId(null)
    }
  }

  function copy(text: string | null) {
    if (!text) return
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="size-6" /> Virtual Accounts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All provisioned USD / EUR / NGN accounts. Use Refresh on a Pending row to pull the latest details from Graph.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, name, account #, or external id"
                value={q}
                onChange={e => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={currency} onValueChange={(v) => v && setCurrency(v as typeof currency)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Currency">
                  {(v: unknown) => v === 'ALL' ? 'All currencies' : String(v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All currencies</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="NGN">NGN</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status">
                  {(v: unknown) => {
                    const labels: Record<string, string> = {
                      ALL: 'All statuses',
                      active: 'Active',
                      pending: 'Pending',
                      suspended: 'Suspended',
                      closed: 'Closed',
                      success: 'Active',
                    }
                    return labels[String(v)] ?? null
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchList} disabled={loading} className="sm:ml-auto">
              {loading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{total} account{total === 1 ? '' : 's'}</p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Currency</th>
                <th className="text-left px-4 py-3 font-medium">Bank</th>
                <th className="text-left px-4 py-3 font-medium">Account #</th>
                <th className="text-left px-4 py-3 font-medium">Routing</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="size-5 mx-auto animate-spin" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  No virtual accounts {currency !== 'ALL' || status !== 'ALL' || q ? 'match these filters' : 'yet'}.
                </td></tr>
              ) : rows.map(r => {
                const tone = STATUS_TONE[r.status] ?? 'bg-muted text-muted-foreground'
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[200px]">{r.user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{r.currency}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.bankName ?? <span className="italic opacity-60">— provisioning</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {r.accountNumber ? (
                        <button onClick={() => copy(r.accountNumber)} className="hover:text-primary inline-flex items-center gap-1.5">
                          {r.accountNumber}
                          <Copy className="size-3 opacity-50" />
                        </button>
                      ) : (
                        <span className="italic opacity-60">— provisioning</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.routingNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('font-medium', tone)} variant="outline">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refresh(r.id)}
                        disabled={refreshingId === r.id}
                      >
                        {refreshingId === r.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
