'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatDate } from '@/lib/utils/format'
import { Truck, Plus, Search, FileText } from 'lucide-react'

type WaybillStatus = 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'

interface WaybillItem {
  id: string; description: string; quantity: number; unit: string; weight: number | null; notes: string | null
}

interface Waybill {
  id: string
  waybillNumber: string
  status: WaybillStatus
  shipperName: string
  consigneeName: string
  consigneeAddress: string
  driverName: string | null
  vehicleNumber: string | null
  createdAt: string
  dispatchedAt: string | null
  deliveredAt: string | null
  items: WaybillItem[]
}

const STATUS_STYLES: Record<WaybillStatus, string> = {
  DRAFT:      'bg-gray-100 text-gray-700',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  CANCELLED:  'bg-red-100 text-red-700',
}

export default function WaybillsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState<'all' | WaybillStatus>('all')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/waybills')
      if (res.ok) setWaybills(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const filtered = waybills.filter(w => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || w.waybillNumber.toLowerCase().includes(q)
      || w.consigneeName.toLowerCase().includes(q)
      || w.consigneeAddress.toLowerCase().includes(q)
      || (w.driverName ?? '').toLowerCase().includes(q)
    const matchStatus = status === 'all' || w.status === status
    return matchSearch && matchStatus
  })

  const counts = waybills.reduce((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Waybills</h1>
            <p className="text-sm text-gray-500 mt-0.5">Delivery notes and goods-in-transit records</p>
          </div>
          <Link
            href="/waybills/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> New Waybill
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'DRAFT', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-2 text-xs font-bold border-2 transition-colors ${
                  status === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {s === 'all' ? 'All' : s}
                {s !== 'all' && counts[s] != null && (
                  <span className="ml-1 opacity-70">({counts[s]})</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search waybill, consignee, driver…"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 flex flex-col items-center py-16">
            <Truck className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-lg font-semibold text-gray-700">No waybills found</p>
            <p className="text-sm text-gray-400 mt-1">
              {search ? 'Try a different search' : 'Create your first waybill'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(w => (
              <Link
                key={w.id}
                href={`/waybills/${w.id}`}
                className="block bg-white border border-gray-200 px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{w.waybillNumber}</span>
                        <span className={`px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[w.status]}`}>
                          {w.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        To: <strong>{w.consigneeName}</strong> · {w.consigneeAddress}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400 sm:text-right shrink-0">
                    <span>{w.items.length} item{w.items.length !== 1 ? 's' : ''}</span>
                    {w.driverName && <span>Driver: {w.driverName}</span>}
                    <span>{formatDate(w.createdAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
