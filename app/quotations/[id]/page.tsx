'use client'
import { smartPrint } from '@/lib/print/print'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { formatTaxLabel, summariseTaxBreakdown } from '@/lib/tax/summary'

type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED'

interface Quotation {
  id: string
  customerId: string | null
  customer: { id: string; name: string; phone: string | null } | null
  status: QuotationStatus
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  note: string | null
  validUntil: string | null
  createdAt: string
  taxLines: {
    taxRateId: string | null
    taxName: string
    taxRatePercentage: number
    taxableAmount: number
    taxAmount: number
  }[]
  items: {
    id: string
    itemId: string
    itemName: string
    quantity: number
    price: number
    lineSubtotalAmount: number
    lineTaxAmount: number
    lineTotalAmount: number
    taxLines: {
      taxRateId: string | null
      taxName: string
      taxRatePercentage: number
      taxableAmount: number
      taxAmount: number
    }[]
  }[]
}

const STATUS_COLORS: Record<QuotationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
  CONVERTED: 'bg-indigo-100 text-indigo-700',
}

export default function QuotationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convertError, setConvertError] = useState('')
  const [actionError, setActionError] = useState('')

  const fetchQuotation = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/quotations/${id}`)
      if (!res.ok) throw new Error('Quotation not found')
      const data = await res.json()
      setQuotation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => { fetchQuotation() }, [fetchQuotation])

  const updateStatus = async (status: QuotationStatus) => {
    if (!quotation) return
    setIsUpdatingStatus(true)
    setActionError('')
    try {
      const res = await fetch(`/api/quotations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update status')
      setQuotation(q => q ? { ...q, status } : q)
    } catch (err) {
      // Previously try/finally with no catch — a 403/409 vanished silently
      setActionError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const convertToSale = async () => {
    if (!quotation) return
    setConvertError('')
    setIsConverting(true)
    try {
      const res = await fetch(`/api/quotations/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: quotation.totalAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to convert')
      const saleId = data.saleId ?? data.id ?? data.data?.id
      if (!saleId) {
        throw new Error('Sale was created, but no sale reference was returned')
      }
      router.push(`/sales/${saleId}`)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to convert')
      setIsConverting(false)
    }
  }

  const deleteQuotation = async () => {
    if (!confirm('Delete this quotation? This cannot be undone.')) return
    setActionError('')
    try {
      const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' })
      // The response status was previously never checked, so a 403 still
      // navigated away as though the delete had succeeded.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete quotation')
      }
      router.push('/quotations')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete quotation')
    }
  }

  if (isLoading) return (
    <AppLayout>
      <div className="flex justify-center items-center py-20">
        <div className="text-gray-500">Loading quotation...</div>
      </div>
    </AppLayout>
  )

  if (error || !quotation) return (
    <AppLayout>
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error || 'Not found'}</div>
    </AppLayout>
  )

  // Expiry applies to any quotation still awaiting conversion, not just SENT ones
  const isExpiredNow = !!quotation.validUntil
    && new Date(quotation.validUntil) < new Date()
    && !['CONVERTED', 'REJECTED', 'EXPIRED'].includes(quotation.status)
  const canConvert =
    quotation.status !== 'REJECTED' &&
    quotation.status !== 'EXPIRED' &&
    quotation.status !== 'CONVERTED' &&
    !isExpiredNow
  const taxBreakdown = summariseTaxBreakdown(quotation.taxLines ?? [])

  return (
    <AppLayout>
      {/* Screen toolbar */}
      <div className="max-w-3xl mx-auto mb-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={() => router.push('/quotations')}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Quotations
          </button>

          <div className="flex flex-wrap gap-2 flex-1 sm:justify-end">
            {/* Status actions */}
            {quotation.status === 'DRAFT' && (
              <button
                onClick={() => updateStatus('SENT')}
                disabled={isUpdatingStatus}
                className="px-4 py-2 text-sm font-semibold border-2 border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Mark as Sent
              </button>
            )}
            {quotation.status === 'SENT' && (
              <>
                <button
                  onClick={() => updateStatus('REJECTED')}
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 text-sm font-semibold border-2 border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => updateStatus('ACCEPTED')}
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 text-sm font-semibold border-2 border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  Accept
                </button>
              </>
            )}
            {canConvert && (
              <button
                onClick={convertToSale}
                disabled={isConverting}
                className="px-4 py-2 text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isConverting ? 'Converting...' : '✓ Convert to Sale'}
              </button>
            )}
            {quotation.status === 'CONVERTED' && (
              <span className="px-4 py-2 text-sm font-semibold bg-indigo-50 text-indigo-700 border-2 border-indigo-200">
                ✓ Converted to a sale
              </span>
            )}
            {isExpiredNow && quotation.status !== 'CONVERTED' && (
              <span className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-700 border-2 border-red-200">
                Expired — cannot convert
              </span>
            )}
            <button
              onClick={() => smartPrint('report')}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
            >
              🖨️ Print / PDF
            </button>
            {quotation.status === 'DRAFT' && (
              <button
                onClick={deleteQuotation}
                className="px-4 py-2 text-sm font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {convertError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            ⚠ {convertError}
          </div>
        )}
        {actionError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            ⚠ {actionError}
          </div>
        )}
      </div>

      {/* Printable document */}
      <div className="max-w-3xl mx-auto bg-white border border-gray-200 overflow-hidden print:border-0 print:-none print:shadow-none">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Proforma Invoice / Quotation</p>
              <h1 className="text-2xl font-bold text-gray-900">#{quotation.id.slice(0, 8).toUpperCase()}</h1>
              <p className="text-sm text-gray-500 mt-1">Date: {formatDate(quotation.createdAt)}</p>
              {quotation.validUntil && (
                <p className={`text-sm mt-0.5 ${isExpiredNow ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  Valid until: {formatDate(quotation.validUntil)}{isExpiredNow ? ' — EXPIRED' : ''}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className={`px-3 py-1.5 -full text-sm font-bold ${STATUS_COLORS[quotation.status]}`}>
                {quotation.status}
              </span>
              {quotation.customer && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-gray-400 uppercase">Customer</p>
                  <p className="text-base font-bold text-gray-900">{quotation.customer.name}</p>
                  {quotation.customer.phone && <p className="text-sm text-gray-500">{quotation.customer.phone}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 text-xs font-bold text-gray-500 uppercase">#</th>
                <th className="text-left py-2 text-xs font-bold text-gray-500 uppercase">Item</th>
                <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Qty</th>
                <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Unit Price</th>
                <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Subtotal</th>
                <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Tax</th>
                <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotation.items.map((item, i) => (
                <tr key={item.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                  <td className="py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-3 font-semibold text-gray-900">{item.itemName}</td>
                  <td className="py-3 text-right text-gray-700">{item.quantity}</td>
                  <td className="py-3 text-right text-gray-700">{formatCurrency(item.price)}</td>
                  <td className="py-3 text-right text-gray-700">{formatCurrency(item.lineSubtotalAmount ?? item.price * item.quantity)}</td>
                  <td className="py-3 text-right text-emerald-700 font-semibold">{formatCurrency(item.lineTaxAmount ?? 0)}</td>
                  <td className="py-3 text-right font-bold text-gray-900">{formatCurrency(item.lineTotalAmount ?? item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan={4} />
                <td className="py-3 text-right font-bold text-gray-700">Subtotal</td>
                <td colSpan={2} className="py-3 text-right font-bold text-gray-900">{formatCurrency(quotation.subtotalAmount ?? quotation.totalAmount)}</td>
              </tr>
              {taxBreakdown.map((taxLine) => (
                <tr key={`${taxLine.taxRateId ?? taxLine.taxName}-${taxLine.taxRatePercentage}`}>
                  <td colSpan={4} />
                  <td className="py-2 text-right font-semibold text-emerald-700">
                    {formatTaxLabel(taxLine)}
                  </td>
                  <td colSpan={2} className="py-2 text-right font-semibold text-emerald-900">
                    {formatCurrency(taxLine.taxAmount)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} />
                <td className="py-4 text-right font-bold text-gray-700 text-base">Total</td>
                <td colSpan={2} className="py-4 text-right font-bold text-gray-900 text-xl">{formatCurrency(quotation.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          {quotation.note && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Note</p>
              <p className="text-sm text-gray-700">{quotation.note}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center mt-4">
            This is a quotation only, not a tax invoice. Prices subject to change without notice.
          </p>
          <p className="text-[10px] text-gray-300 text-center mt-3 border-t border-dashed border-gray-100 pt-2">
            System Developed EYO Solutions | 0246462398
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
