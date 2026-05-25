'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'

type POStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED'

interface PurchaseOrder {
  id: string
  status: POStatus
  totalAmount: number
  note: string | null
  expectedAt: string | null
  createdAt: string
  supplier: { id: string; name: string } | null
  items: { id: string; itemName: string; quantity: number; costPrice: number }[]
}

const STATUS_META: Record<POStatus, { label: string; cls: string; badge: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-700',    badge: 'bg-gray-500' },
  SENT:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700',    badge: 'bg-blue-500' },
  RECEIVED:  { label: 'Received',  cls: 'bg-green-100 text-green-700',  badge: 'bg-green-500' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700',      badge: 'bg-red-500' },
}

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchOrders() }, [])

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/purchase-orders')
      if (!res.ok) throw new Error()
      setOrders(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const counts = {
    all: orders.length,
    DRAFT: orders.filter(o => o.status === 'DRAFT').length,
    SENT: orders.filter(o => o.status === 'SENT').length,
    RECEIVED: orders.filter(o => o.status === 'RECEIVED').length,
    CANCELLED: orders.filter(o => o.status === 'CANCELLED').length,
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q
      || (o.supplier?.name || '').toLowerCase().includes(q)
      || o.items.some(i => i.itemName.toLowerCase().includes(q))
      || o.id.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{orders.length} total orders</p>
          </div>
          <div className="flex gap-2">
            <ExportButton
              filename="purchase-orders"
              getData={() => filtered.map(o => ({
                ID: o.id.slice(0, 8).toUpperCase(),
                Supplier: o.supplier?.name || '—',
                Status: o.status,
                'Total (GHS)': o.totalAmount.toFixed(2),
                'Expected At': o.expectedAt ? formatDate(o.expectedAt) : '',
                Created: formatDate(o.createdAt),
                Items: o.items.length,
              }))}
            />
            <button
              onClick={() => router.push('/purchase-orders/new')}
              className="flex items-center gap-1 px-5 py-2.5 bg-green-600 text-white font-bold hover:bg-green-700 text-sm shadow-md"
            >
              <span className="text-lg leading-none">+</span> New PO
            </button>
          </div>
        </div>

        {/* Status summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(['all', 'DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`p-4 border-2 text-left transition-all ${
                statusFilter === s
                  ? s === 'all' ? 'bg-gray-900 border-gray-900 text-white' : `${STATUS_META[s].cls.replace('bg-', 'ring-2 ring-').replace(' text-', ' bg-').replace('-100', '-200')} border-current`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-xs font-semibold uppercase text-current opacity-70">
                {s === 'all' ? 'All' : STATUS_META[s].label}
              </p>
              <p className="text-2xl font-bold mt-1">{counts[s]}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by supplier, item, or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="bg-white h-24 animate-pulse border border-gray-200" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 flex flex-col items-center py-16">
            <span className="text-5xl mb-3">📋</span>
            <p className="font-semibold text-gray-700">No purchase orders found</p>
            {!search && statusFilter === 'all' && (
              <button onClick={() => router.push('/purchase-orders/new')} className="mt-4 px-5 py-2 bg-green-600 text-white font-semibold hover:bg-green-700">
                Create First PO
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(order => {
                const meta = STATUS_META[order.status]
                return (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/purchase-orders/${order.id}`)}
                    className="bg-white border border-gray-200 p-4 cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-green-600 font-semibold mt-0.5">{order.supplier?.name || 'No Supplier'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatDate(order.createdAt)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs px-2 py-0.5 -full font-semibold ${meta.cls}`}>{meta.label}</span>
                        <p className="text-base font-bold text-gray-900 mt-1">{formatCurrency(order.totalAmount)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-600 uppercase">PO #</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-600 uppercase">Supplier</th>
                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-600 uppercase">Items</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-600 uppercase">Total</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-600 uppercase">Expected</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-600 uppercase">Created</th>
                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(order => {
                    const meta = STATUS_META[order.status]
                    return (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/purchase-orders/${order.id}`)}
                        className="hover:bg-green-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-4 font-mono text-sm text-gray-700">#{order.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-5 py-4">
                          <span className="text-sm text-green-700 font-semibold bg-green-50 px-2 py-0.5">
                            {order.supplier?.name || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center text-sm text-gray-700">{order.items.length}</td>
                        <td className="px-5 py-4 text-right text-sm font-bold text-gray-900">{formatCurrency(order.totalAmount)}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{order.expectedAt ? formatDate(order.expectedAt) : '—'}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{formatDate(order.createdAt)}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-2.5 py-1 -full text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
