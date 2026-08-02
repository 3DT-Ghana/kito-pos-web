'use client'
import { smartPrint } from '@/lib/print/print'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'

type POStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED'

interface PurchaseOrder {
  id: string
  status: POStatus
  totalAmount: number
  note: string | null
  expectedAt: string | null
  createdAt: string
  supplier: { id: string; name: string; phone?: string } | null
  items: { id: string; itemId: string; itemName: string; quantity: number; costPrice: number }[]
}

const STATUS_META: Record<POStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-700' },
  SENT:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700' },
  RECEIVED:  { label: 'Received',  cls: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
}

export default function PurchaseOrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [paidAmount, setPaidAmount] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => { fetchOrder() }, [orderId])

  const fetchOrder = async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`)
      if (res.ok) { setOrder(await res.json()); return }
      // Was `throw new Error()` inside try/finally with no catch — an
      // unhandled rejection, and a 403/500 rendered as "not found".
      const data = await res.json().catch(() => ({}))
      setLoadError(data.error || (res.status === 404 ? '' : 'Failed to load purchase order'))
    } catch {
      setLoadError('Could not reach the server. Check your connection and retry.')
    } finally {
      setIsLoading(false)
    }
  }

  const updateStatus = async (status: POStatus) => {
    setIsUpdating(true)
    setActionError('')
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      // The response was never checked, so a 403/409 made the button appear
      // to do nothing at all.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update status')
      }
      await fetchOrder()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this purchase order?')) return
    setActionError('')
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`, { method: 'DELETE' })
      if (res.ok) { router.push('/purchase-orders'); return }
      const data = await res.json().catch(() => ({}))
      setActionError(data.error || 'Failed to delete')
    } catch {
      setActionError('Could not reach the server. Please try again.')
    }
  }

  const handleReceive = async () => {
    setConvertError('')
    if (!order?.supplier) {
      setConvertError('This PO has no supplier set. Add a supplier before receiving.')
      return
    }
    setIsConverting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: parseFloat(paidAmount) || 0 }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to receive')
      }
      const data = await res.json()
      // The convert route returns the purchase record itself, so the id is on
      // `id` — `data.purchaseId` was undefined and sent every successful
      // receive to /purchases/undefined.
      router.push(`/purchases/${data.id}`)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to receive')
    } finally {
      setIsConverting(false)
    }
  }

  if (isLoading) {
    return <AppLayout><div className="max-w-3xl mx-auto space-y-4">{[1,2,3].map(i => <div key={i} className="bg-white h-32 animate-pulse border border-gray-200" />)}</div></AppLayout>
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto text-center py-16 space-y-3">
          <p className={loadError ? 'text-red-600' : 'text-gray-500'}>
            {loadError || 'Purchase order not found'}
          </p>
          {loadError && (
            <button
              onClick={() => { setIsLoading(true); void fetchOrder() }}
              className="px-4 py-2 text-sm font-semibold border-2 border-gray-200 hover:bg-gray-50"
            >
              Retry
            </button>
          )}
        </div>
      </AppLayout>
    )
  }

  const meta = STATUS_META[order.status]
  const canSend = order.status === 'DRAFT'
  const canReceive = order.status === 'DRAFT' || order.status === 'SENT'
  const canCancel = order.status === 'DRAFT' || order.status === 'SENT'
  const canDelete = order.status === 'DRAFT'

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5 print:space-y-3">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm print:hidden">
            ⚠ {actionError}
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 print:hidden">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/purchase-orders')} className="p-2 hover:bg-gray-100 print:hidden">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">PO #{order.id.slice(0, 8).toUpperCase()}</h1>
                <span className={`text-xs px-2 py-0.5 -full font-semibold ${meta.cls}`}>{meta.label}</span>
              </div>
              <p className="text-sm text-gray-500">Created {formatDate(order.createdAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {canSend && (
              <button onClick={() => updateStatus('SENT')} disabled={isUpdating}
                className="px-3 py-2 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                Mark as Sent
              </button>
            )}
            {canReceive && (
              <button onClick={() => { setPaidAmount(order.totalAmount.toFixed(2)); setShowReceiveModal(true) }} disabled={isUpdating}
                className="px-3 py-2 bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50">
                Receive Goods
              </button>
            )}
            {canCancel && (
              <button onClick={() => updateStatus('CANCELLED')} disabled={isUpdating}
                className="px-3 py-2 bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 disabled:opacity-50">
                Cancel
              </button>
            )}
            <button onClick={() => smartPrint('report')}
              className="px-3 py-2 bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700">
              Print PO
            </button>
            {canDelete && (
              <button onClick={handleDelete}
                className="px-3 py-2 bg-red-50 text-red-600 border-2 border-red-100 font-semibold text-sm hover:bg-red-100">
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Printable PO document */}
        <div className="bg-white border border-gray-200 p-6 print:border-0 print:-none print:p-8 print:shadow-none">
          {/* Print header */}
          <div className="hidden print:flex items-start justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Purchase Order</h2>
              <p className="text-gray-500 mt-1">PO #{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Date: {formatDate(order.createdAt)}</p>
              <p className="text-sm text-gray-500">Status: {meta.label}</p>
              {order.expectedAt && <p className="text-sm text-gray-500">Expected: {formatDate(order.expectedAt)}</p>}
            </div>
          </div>

          {/* Supplier info */}
          <div className="mb-6">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Supplier</p>
            {order.supplier ? (
              <div>
                <p className="text-lg font-bold text-gray-900">{order.supplier.name}</p>
                {order.supplier.phone && <p className="text-sm text-gray-500">{order.supplier.phone}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No supplier assigned</p>
            )}
          </div>

          {/* Items table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-2 text-left text-xs font-bold text-gray-500 uppercase">#</th>
                <th className="pb-2 text-left text-xs font-bold text-gray-500 uppercase">Item</th>
                <th className="pb-2 text-center text-xs font-bold text-gray-500 uppercase">Qty</th>
                <th className="pb-2 text-right text-xs font-bold text-gray-500 uppercase">Unit Cost</th>
                <th className="pb-2 text-right text-xs font-bold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2.5 text-sm text-gray-400">{idx + 1}</td>
                  <td className="py-2.5 text-sm font-semibold text-gray-900">{item.itemName}</td>
                  <td className="py-2.5 text-sm text-center text-gray-700">{item.quantity}</td>
                  <td className="py-2.5 text-sm text-right text-gray-700">{formatCurrency(item.costPrice)}</td>
                  <td className="py-2.5 text-sm text-right font-bold text-gray-900">{formatCurrency(item.quantity * item.costPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={4} className="pt-3 text-right text-base font-bold text-gray-700">Total Order Value</td>
                <td className="pt-3 text-right text-xl font-bold text-green-700">{formatCurrency(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          {order.note && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Notes</p>
              <p className="text-sm text-gray-700">{order.note}</p>
            </div>
          )}
          {order.expectedAt && (
            <div className="mt-3">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Expected Delivery</p>
              <p className="text-sm text-gray-700">{formatDate(order.expectedAt)}</p>
            </div>
          )}
        </div>

        {/* Receive Goods Modal */}
        {showReceiveModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Receive Goods</h3>
              <p className="text-sm text-gray-600">
                This will create a purchase record, update stock levels, and mark the PO as received.
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Amount Paid (GH₵)
                </label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  max={order.totalAmount}
                  placeholder={order.totalAmount.toFixed(2)}
                  className="w-full px-4 py-3 border-2 border-green-200 focus:border-green-500 focus:outline-none text-xl font-bold"
                />
                <p className="text-xs text-gray-500 mt-1">Total order value: {formatCurrency(order.totalAmount)}</p>
                {(parseFloat(paidAmount) || 0) < order.totalAmount && (
                  <p className="text-xs text-orange-600 font-semibold mt-1">
                    Credit: {formatCurrency(order.totalAmount - (parseFloat(paidAmount) || 0))} will be added to supplier balance
                  </p>
                )}
              </div>
              {convertError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
                  {convertError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowReceiveModal(false); setConvertError('') }}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleReceive} disabled={isConverting}
                  className="flex-1 py-3 bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50">
                  {isConverting ? 'Processing...' : 'Confirm Receive'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
