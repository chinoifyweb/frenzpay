'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type AuditLogItem } from '@/lib/api'
import { Search, Shield } from 'lucide-react'

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  KYC_APPROVED: 'bg-green-100 text-green-700',
  KYC_REJECTED: 'bg-red-100 text-red-700',
  USER_FROZEN: 'bg-orange-100 text-orange-700',
  USER_ACTIVATED: 'bg-emerald-100 text-emerald-700',
  WALLET_FROZEN: 'bg-blue-100 text-blue-700',
  TRANSACTION_REVERSED: 'bg-purple-100 text-purple-700',
  PASSWORD_CHANGED: 'bg-amber-100 text-amber-700',
  OTP_SENT: 'bg-sky-100 text-sky-700',
  SIGNUP: 'bg-indigo-100 text-indigo-700',
}

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {action.replace(/_/g, ' ')}
    </span>
  )
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.auditLogs(page, search)
      setItems(res.items)
      setTotal(res.total)
      setPages(res.pages)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 text-sm">
            {total.toLocaleString()} immutable records
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-56"
              placeholder="Filter by action…"
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Timestamp</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Resource</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No audit log entries found</p>
                </td>
              </tr>
            ) : (
              items.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{actionBadge(log.action)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {log.user_email ?? (
                      <span className="text-gray-400 italic">system</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {log.resource_type && (
                      <span className="font-medium text-gray-700">{log.resource_type}</span>
                    )}
                    {log.resource_id && (
                      <span className="text-gray-400 ml-1 font-mono">#{log.resource_id.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {log.ip_address ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
              Page {page} of {pages} · {total.toLocaleString()} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white transition"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
