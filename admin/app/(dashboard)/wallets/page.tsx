'use client'

import { useEffect, useState } from 'react'
import { api, type WalletOverview } from '@/lib/api'
import { Wallet, TrendingUp, Snowflake, RefreshCw } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const CURRENCY_COLORS: Record<string, string> = {
  USD: '#6d28d9',
  GBP: '#2563eb',
  EUR: '#0891b2',
  NGN: '#16a34a',
  KES: '#d97706',
  GHS: '#dc2626',
  XAF: '#9333ea',
  XOF: '#db2777',
}

const WALLET_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  FROZEN: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-gray-100 text-gray-500',
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function WalletsPage() {
  const [data, setData] = useState<WalletOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api
      .wallets()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (error)
    return (
      <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
        Failed to load wallet data: {error}
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallets</h1>
          <p className="text-gray-500 text-sm mt-0.5">Platform-wide wallet balances and status</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      ) : data ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Total Wallets"
              value={data.total_wallets.toLocaleString()}
              icon={Wallet}
              color="bg-purple-500"
              sub={`${data.by_currency.length} currencies`}
            />
            <StatCard
              label="Frozen Wallets"
              value={data.frozen_wallets.toLocaleString()}
              icon={Snowflake}
              color="bg-blue-500"
              sub="Suspended / blocked"
            />
            <StatCard
              label="Active Currencies"
              value={data.by_currency.length}
              icon={TrendingUp}
              color="bg-indigo-500"
              sub="With at least one wallet"
            />
          </div>

          {/* Currency breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-4 text-sm">
                Total Balance by Currency
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.by_currency} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="currency" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, _: string, entry: { payload: { currency: string } }) =>
                      [`${v.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${entry.payload.currency}`, 'Balance']
                    }
                  />
                  <Bar dataKey="total_balance" radius={[4, 4, 0, 0]}>
                    {data.by_currency.map(entry => (
                      <Cell
                        key={entry.currency}
                        fill={CURRENCY_COLORS[entry.currency] ?? '#8b5cf6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Currency table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Currency Breakdown</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Currency
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                      Wallets
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                      Total Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.by_currency.map(c => (
                    <tr key={c.currency} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span
                          className="font-semibold text-xs px-2 py-0.5 rounded"
                          style={{
                            background: CURRENCY_COLORS[c.currency] + '18',
                            color: CURRENCY_COLORS[c.currency] ?? '#6d28d9',
                          }}
                        >
                          {c.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {c.wallet_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {c.total_balance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top USD wallets */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">Top USD Wallets</h2>
              <p className="text-xs text-gray-400 mt-0.5">Highest balance USD wallets on platform</p>
            </div>
            {data.top_usd_wallets.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">No USD wallets yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">User</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                      Balance
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                      Available
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                      Held
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.top_usd_wallets.map((w, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{w.user_name}</p>
                        <p className="text-gray-400 text-xs">{w.user_email}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        ${w.balance.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-700">
                        ${w.available.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-600">
                        ${w.held.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            WALLET_STATUS_COLORS[w.status] ?? ''
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
