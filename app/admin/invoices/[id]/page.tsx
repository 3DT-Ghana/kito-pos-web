'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminLayout } from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { ChevronLeft, Printer, Check } from 'lucide-react'
import { getAllowedInvoiceTransitions } from '@/lib/billing/status'
import type { InvoiceStatus } from '@prisma/client'

interface LineItem {
  id: string; description: string; quantity: number; unitPrice: number
  discount: number; vatRate: number; vatAmount: number; lineTotal: number
}

interface Commission {
  id: string; description: string; commissionRate: number; commissionAmount: number; status: string
  agent: { id: string; agentCode: string; fullName: string }
}

interface Invoice {
  id: string; invoiceNumber: string; tenantId: string; tenantName: string
  billingCycle: string; status: string
  subtotal: number; vatAmount: number; discountAmount: number; total: number
  dueDate: string | null; paidAt: string | null; notes: string | null
  createdAt: string; lineItems: LineItem[]; commissions: Commission[]
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-400',
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const r = await fetch(`/api/admin/invoices/${id}`)
    const data = await r.json()
    setInvoice(r.ok ? data : null)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function changeStatus(status: string) {
    setUpdating(true)
    setMessage(null)
    const res = await fetch(`/api/admin/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    setUpdating(false)
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed' })
    } else {
      setMessage({ type: 'success', text: `Invoice marked ${status}.` })
      load()
    }
  }

  if (loading) return <AdminLayout><div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div></AdminLayout>
  if (!invoice) return <AdminLayout><p className="text-sm text-red-500">Invoice not found.</p></AdminLayout>

  const transitions = getAllowedInvoiceTransitions(invoice.status as InvoiceStatus)

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/admin/invoices" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back to Invoices
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-mono">{invoice.invoiceNumber}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{invoice.tenantName}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLE[invoice.status]}`}>
                {invoice.status}
              </span>
              <button onClick={() => window.print()} className="p-2 border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {message.text}
          </div>
        )}

        {/* Invoice meta */}
        <div className="bg-white border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Billing Cycle</p>
              <p className="font-medium text-gray-900">{invoice.billingCycle.replace('_', '-')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Created</p>
              <p className="font-medium text-gray-900">{new Date(invoice.createdAt).toLocaleDateString()}</p>
            </div>
            {invoice.dueDate && (
              <div>
                <p className="text-xs text-gray-400">Due Date</p>
                <p className="font-medium text-gray-900">{new Date(invoice.dueDate).toLocaleDateString()}</p>
              </div>
            )}
            {invoice.paidAt && (
              <div>
                <p className="text-xs text-gray-400">Paid On</p>
                <p className="font-medium text-emerald-700">{new Date(invoice.paidAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {invoice.notes && <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">{invoice.notes}</p>}
        </div>

        {/* Line items */}
        <div className="bg-white border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Line Items</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-semibold">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-2.5 text-right font-semibold">Discount</th>
                <th className="px-3 py-2.5 text-right font-semibold">VAT</th>
                <th className="px-5 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((line) => (
                <tr key={line.id}>
                  <td className="px-5 py-3 text-gray-900">{line.description}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{line.quantity}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{line.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{line.discount > 0 ? `-${line.discount.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{line.vatAmount > 0 ? `+${line.vatAmount.toFixed(2)}` : '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{line.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-100 px-5 py-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>GHS {invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span><span>-GHS {invoice.discountAmount.toFixed(2)}</span>
              </div>
            )}
            {invoice.vatAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>VAT</span><span>+GHS {invoice.vatAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100 mt-1">
              <span>Total</span><span>GHS {invoice.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Commissions */}
        {invoice.commissions.length > 0 && (
          <div className="bg-white border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Agent Commissions</h2>
            {invoice.commissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{c.agent.fullName} <span className="text-xs text-gray-400">{c.agent.agentCode}</span></p>
                  <p className="text-xs text-gray-400">{c.description} · {c.commissionRate}%</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-700">GHS {c.commissionAmount.toFixed(2)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Status actions */}
        {transitions.length > 0 && (
          <div className="bg-white border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Update Status</h2>
            <div className="flex gap-2 flex-wrap">
              {transitions.map((st) => (
                <button
                  key={st}
                  onClick={() => changeStatus(st)}
                  disabled={updating}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-60 ${
                    st === 'PAID' ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' :
                    st === 'VOID' ? 'text-red-700 border-red-300 hover:bg-red-50' :
                    'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {st === 'PAID' && <Check className="w-4 h-4" />}
                  Mark {st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
