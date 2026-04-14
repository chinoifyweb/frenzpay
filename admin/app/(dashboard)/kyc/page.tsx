'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, type KYCItem } from '@/lib/api'
import { CheckCircle, XCircle } from 'lucide-react'

export default function KYCPage() {
  const [items, setItems] = useState<KYCItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.kycQueue(page)
      setItems(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  async function approve(id: string) {
    await api.approveKyc(id)
    load()
  }

  async function reject() {
    if (!rejectModal || !rejectReason.trim()) return
    await api.rejectKyc(rejectModal, rejectReason)
    setRejectModal(null)
    setRejectReason('')
    load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">KYC Queue</h1>
        <p className="text-gray-500 text-sm">{total} pending review</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tier</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">No pending KYC submissions</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{item.user_name}</p>
                  <p className="text-gray-400 text-xs">{item.user_email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">
                    {item.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{item.provider}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(item.submitted_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => setRejectModal(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-gray-900 mb-3">Reject KYC Submission</h2>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={reject}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium">
                Confirm Reject
              </button>
              <button onClick={() => setRejectModal(null)}
                className="flex-1 border border-gray-200 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
