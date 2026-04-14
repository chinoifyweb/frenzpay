'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type TxItem } from '@/lib/api'
import { Search } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-amber-100 text-amber-700',
  INITIATED: 'bg-gray-100 text-gray-600',
  REVERSED: 'bg-purple-100 text-purple-700',
}

const TYPE_COLORS: Record<string, string> = {
  SEND: 'text-blue-700',
  RECEIVE: 'text-green-700',
  WITHDRAWAL: 'text-orange-700',
  DEPOSIT: 'text-indigo-700',
  CONVERSION: 'text-purple-700',
}

export default function TransactionsPage() {
  const [items, setItems] = useState<TxItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.transactions(page, status, search)
      setItems(res.items)
      setTotal(res.total)
      setPages(res.pages)
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 text-sm">{total.toLocaleString()} total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-56"
              placeholder="Reference or email…"
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select
            value={status}
            onChange={e => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All statuses</option>
            {['COMPLETED', 'FAILED', 'PROCESSING', 'PENDING', 'INITIATED', 'REVERSED'].map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Reference</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  No transactions found
                </td>
              </tr>
            ) : (
              items.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-mono text-xs text-purple-700">
                    {tx.reference}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{tx.user_email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${TYPE_COLORS[tx.type] ?? 'text-gray-600'}`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <span>
                      {tx.source_amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}{' '}
                      <span className="text-gray-500">{tx.source_currency}</span>
                    </span>
                    {tx.source_currency !== tx.destination_currency && (
                      <span className="text-gray-400 text-xs ml-1">
                        → {tx.destination_amount.toFixed(2)} {tx.destination_currency}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[tx.status] ?? ''
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(tx.initiated_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
              Page {page} of {pages} · {total.toLocaleString()} transactions
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
