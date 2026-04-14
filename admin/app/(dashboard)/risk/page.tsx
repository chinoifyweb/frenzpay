'use client'

import { useEffect, useState } from 'react'
import { api, type RiskFlag } from '@/lib/api'

const SEV: Record<string, string> = {
  LOW: 'bg-yellow-100 text-yellow-700',
  MEDIUM: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-red-100 text-red-700',
  CRITICAL: 'bg-red-200 text-red-900 font-semibold',
}

export default function RiskPage() {
  const [flags, setFlags] = useState<RiskFlag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.riskFlags().then(setFlags).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Risk Flags</h1>
        <p className="text-gray-500 text-sm">Open compliance alerts</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Flag Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Severity</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : flags.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">No open risk flags</td></tr>
            ) : flags.map(f => (
              <tr key={f.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-gray-600 text-xs">{f.user_email}</td>
                <td className="px-4 py-3 text-gray-700">{f.flag_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${SEV[f.severity] ?? ''}`}>
                    {f.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{f.status}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(f.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
