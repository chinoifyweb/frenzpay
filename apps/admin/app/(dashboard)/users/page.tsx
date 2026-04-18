'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type AdminUser, type AdminUserDetail } from '@/lib/api'
import {
  Search,
  UserX,
  UserCheck,
  X,
  Wallet,
  ArrowLeftRight,
  ChevronDown,
} from 'lucide-react'

const TIERS: Record<string, string> = {
  TIER_0: 'bg-gray-100 text-gray-600',
  TIER_1: 'bg-blue-100 text-blue-700',
  TIER_2: 'bg-indigo-100 text-indigo-700',
  TIER_3: 'bg-purple-100 text-purple-700',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-gray-100 text-gray-500',
}
const TX_STATUS: Record<string, string> = {
  COMPLETED: 'text-green-700',
  FAILED: 'text-red-600',
  PROCESSING: 'text-blue-600',
  PENDING: 'text-amber-600',
  REVERSED: 'text-purple-600',
}

function UserDrawer({
  userId,
  onClose,
  onStatusChange,
}: {
  userId: string
  onClose: () => void
  onStatusChange: () => void
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    api
      .userDetail(userId)
      .then(setUser)
      .finally(() => setLoading(false))
  }, [userId])

  async function toggleStatus() {
    if (!user) return
    setActionLoading(true)
    try {
      if (user.account_status === 'ACTIVE') {
        await api.freezeUser(user.id)
      } else {
        await api.activateUser(user.id)
      }
      const updated = await api.userDetail(userId)
      setUser(updated)
      onStatusChange()
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">User Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full" />
          </div>
        ) : user ? (
          <div className="flex-1 p-6 space-y-6">
            {/* Profile */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {user.first_name} {user.last_name}
                </h3>
                <p className="text-sm text-gray-500">{user.email}</p>
                <p className="text-sm text-gray-500">{user.phone}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {user.country} · Joined {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    STATUS_COLORS[user.account_status] ?? ''
                  }`}
                >
                  {user.account_status}
                </span>
                <span
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    TIERS[user.kyc_tier] ?? ''
                  }`}
                >
                  {user.kyc_tier}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400">Total Transactions</p>
                <p className="text-xl font-bold text-gray-900">
                  {user.transaction_count.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400">Total Sent (USD)</p>
                <p className="text-xl font-bold text-gray-900">
                  ${user.total_sent_usd.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Wallets */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-purple-600" />
                <h4 className="font-semibold text-gray-800 text-sm">
                  Wallets ({user.wallets.length})
                </h4>
              </div>
              {user.wallets.length === 0 ? (
                <p className="text-sm text-gray-400">No wallets created yet</p>
              ) : (
                <div className="space-y-2">
                  {user.wallets.map(w => (
                    <div
                      key={w.currency}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                    >
                      <div>
                        <span className="font-semibold text-sm text-gray-900">
                          {w.currency}
                        </span>
                        <span
                          className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                            w.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {w.status}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 text-sm">
                          {w.balance.toFixed(4)}
                        </p>
                        <p className="text-xs text-gray-400">
                          Avail: {w.available.toFixed(4)} · Held: {w.held.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent transactions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                <h4 className="font-semibold text-gray-800 text-sm">Recent Transactions</h4>
              </div>
              {user.recent_transactions.length === 0 ? (
                <p className="text-sm text-gray-400">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {user.recent_transactions.map(tx => (
                    <div
                      key={tx.reference}
                      className="flex items-start justify-between bg-gray-50 rounded-lg px-4 py-3"
                    >
                      <div>
                        <p className="font-mono text-xs text-purple-700">{tx.reference}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tx.type.replace(/_/g, ' ')} ·{' '}
                          {new Date(tx.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm text-gray-900">
                          {tx.amount.toFixed(2)} {tx.currency}
                          {tx.currency !== tx.dest_currency && (
                            <span className="text-gray-400 text-xs">
                              {' '}→ {tx.dest_amount.toFixed(2)} {tx.dest_currency}
                            </span>
                          )}
                        </p>
                        <p className={`text-xs font-medium ${TX_STATUS[tx.status] ?? 'text-gray-500'}`}>
                          {tx.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action */}
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={toggleStatus}
                disabled={actionLoading}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                  user.account_status === 'ACTIVE'
                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                    : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                }`}
              >
                {actionLoading
                  ? 'Processing…'
                  : user.account_status === 'ACTIVE'
                  ? 'Suspend Account'
                  : 'Activate Account'}
              </button>
            </div>
          </div>
        ) : (
          <p className="p-6 text-sm text-gray-400">Failed to load user detail.</p>
        )}
      </div>
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.users(page, search)
      setUsers(res.items)
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
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm">{total.toLocaleString()} total users</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
            placeholder="Search email or phone…"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Country</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">KYC</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  No users found
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr
                  key={u.id}
                  className="hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => setSelectedUserId(u.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {u.first_name} {u.last_name}
                    </p>
                    <p className="text-gray-400 text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{u.phone}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{u.country || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        TIERS[u.kyc_tier] ?? ''
                      }`}
                    >
                      {u.kyc_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[u.account_status] ?? ''
                      }`}
                    >
                      {u.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">
              Page {page} of {pages} · {total.toLocaleString()} users
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

      {/* User detail drawer */}
      {selectedUserId && (
        <UserDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onStatusChange={load}
        />
      )}
    </div>
  )
}
