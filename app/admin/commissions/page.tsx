'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Check, TrendingUp } from 'lucide-react'

interface Commission {
  id: string
  tenantName: string
  description: string
  commissionRate: number
  commissionAmount: number
  saleAmount: number
  status: string
  paidAt: string | null
  createdAt: string
  agent: { id: string; agentCode: string; fullName: string }
  invoice: { invoiceNumber: string }
  feature: { name: string } | null
  item: { name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const limit = 25

  async function load(pg = page, st = status) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: String(limit) })
    if (st) params.set('status', st)
    const r = await fetch(`/api/admin/commissions?${params}`)
    const data = await r.json()
    setCommissions(data.commissions ?? [])
    setTotal(data.total ?? 0)
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load(1, status) }, [status])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const pendingIds = commissions.filter((c) => c.status === 'PENDING').map((c) => c.id)
    if (selected.size === pendingIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pendingIds))
    }
  }

  async function markPaid() {
    if (selected.size === 0) return
    setPaying(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed' })
      } else {
        setMessage({ type: 'success', text: `${data.count} commission${data.count !== 1 ? 's' : ''} marked as paid.` })
        load(page, status)
      }
    } finally {
      setPaying(false)
    }
  }

  const totalSelected = commissions.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.commissionAmount, 0)
  const totalPending = commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.commissionAmount, 0)
  const pages = Math.ceil(total / limit)

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Commissions</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} commission record{total !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            {selected.size > 0 && (
              <button
                onClick={markPaid}
                disabled={paying}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                <Check className="w-4 h-4" />
                {paying ? 'Paying…' : `Pay ${selected.size} (GHS ${totalSelected.toFixed(2)})`}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {message.text}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Records', value: total, color: '' },
            { label: 'Pending Amount', value: `GHS ${totalPending.toFixed(2)}`, color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 p-4">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${s.color || 'text-gray-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : commissions.length === 0 ? (
          <div className="bg-white border border-gray-200 p-12 text-center">
            <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No commission records found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <input
                type="checkbox"
                checked={selected.size === commissions.filter((c) => c.status === 'PENDING').length && commissions.some((c) => c.status === 'PENDING')}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select pending</span>
            </div>
            <div className="divide-y divide-gray-50">
              {commissions.map((c) => (
                <div key={c.id} className="flex items-start gap-4 px-5 py-4">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    disabled={c.status !== 'PENDING'}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 disabled:opacity-30"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{c.agent.fullName}</p>
                      <span className="text-xs text-gray-400">{c.agent.agentCode}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[c.status] ?? 'bg-gray-100'}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{c.tenantName} · {c.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Invoice: <span className="font-mono">{c.invoice.invoiceNumber}</span>
                      {' · '}Sale: GHS {c.saleAmount.toFixed(2)} @ {c.commissionRate}%
                      {c.paidAt && <> · Paid {new Date(c.paidAt).toLocaleDateString()}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-700">GHS {c.commissionAmount.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => { setPage(p); load(p, status) }}
                className={`w-8 h-8 text-sm transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
