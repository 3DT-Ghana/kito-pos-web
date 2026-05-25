'use client'

import { Suspense, useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronRight, FileText } from 'lucide-react'

interface Invoice {
  id: string
  invoiceNumber: string
  tenantName: string
  tenantId: string
  billingCycle: string
  status: string
  subtotal: number
  vatAmount: number
  discountAmount: number
  total: number
  dueDate: string | null
  createdAt: string
  _count: { lineItems: number }
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-400',
}

const STATUSES = ['', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID']

function InvoicesPageContent() {
  const searchParams = useSearchParams()
  const tenantIdFilter = searchParams.get('tenantId') ?? ''

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  async function load(pg = page, st = status) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: String(limit) })
    if (tenantIdFilter) params.set('tenantId', tenantIdFilter)
    if (st) params.set('status', st)
    const r = await fetch(`/api/admin/invoices?${params}`)
    const data = await r.json()
    setInvoices(data.invoices ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }

  useEffect(() => { load(1, status) }, [status, tenantIdFilter])

  function changePage(p: number) { setPage(p); load(p, status) }

  const pages = Math.ceil(total / limit)

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} invoice{total !== 1 ? 's' : ''} total</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-white border border-gray-200 p-12 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No invoices found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/admin/invoices/${inv.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-mono font-semibold text-gray-900">{inv.invoiceNumber}</p>
                    <span className={`text-xs px-2 py-0.5 -full font-medium ${STATUS_STYLE[inv.status] ?? 'bg-gray-100'}`}>
                      {inv.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {inv.tenantName} · {inv._count.lineItems} line{inv._count.lineItems !== 1 ? 's' : ''} · {inv.billingCycle.replace('_', '-')}
                    {inv.dueDate && <> · Due {new Date(inv.dueDate).toLocaleDateString()}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">GHS {inv.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => changePage(p)}
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

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
            </div>
          </div>
        </AdminLayout>
      }
    >
      <InvoicesPageContent />
    </Suspense>
  )
}
