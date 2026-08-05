'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ThermalReceipt, printReceipt } from '@/components/receipts/ThermalReceipt'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Printer, Eye, EyeOff, Pencil, RotateCcw, Truck, Trash2 } from 'lucide-react'
import { formatTaxLabel, summariseTaxBreakdown } from '@/lib/tax/summary'
import { useUser } from '@/hooks/useUser'
import { useRolePermissions } from '@/hooks/useTenant'

interface SaleItem {
  id: string
  quantity: number
  price: number
  discountAmount: number | null
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
  item: {
    id: string
    name: string
    manufacturer: {
      id: string
      name: string
    } | null
  }
}

interface Sale {
  id: string
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  paymentMethod: string
  momoPhone: string | null
  bankName: string | null
  bankAccountName: string | null
  bankReference: string | null
  note: string | null
  createdAt: Date
  taxLines: {
    taxRateId: string | null
    taxName: string
    taxRatePercentage: number
    taxableAmount: number
    taxAmount: number
  }[]
  customer: {
    id: string
    name: string
  } | null
  items: SaleItem[]
}

interface Tenant {
  id: string
  name: string
  phone: string | null
  showManufacturerOnReceipt: boolean
  receiptPrinterWidth: string
}

interface SaleReceiptViewProps {
  sale: Sale
  tenant: Tenant
  /** Branch that made the sale, resolved server-side. */
  branchName?: string | null
}

export function SaleReceiptView({ sale, tenant, branchName }: SaleReceiptViewProps) {
  const [showPreview, setShowPreview] = useState(true)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [isVoiding, setIsVoiding] = useState(false)
  const [actionError, setActionError] = useState('')
  const router = useRouter()

  const { user } = useUser()
  const { hasTenantPermission, isLoading: permissionsLoading } = useRolePermissions()
  const canVoid = !permissionsLoading && hasTenantPermission(user?.role, 'void_sales')

  const voidSale = async () => {
    if (!confirm(
      'Void this sale?\n\nStock will be restored and the customer balance adjusted. This cannot be undone.'
    )) return
    setIsVoiding(true)
    setActionError('')
    try {
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to void sale')
      router.push('/sales')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to void sale')
      setIsVoiding(false)
    }
  }

  const creditAmount = sale.totalAmount - sale.paidAmount
  const changeAmount = sale.paidAmount > sale.totalAmount ? sale.paidAmount - sale.totalAmount : 0
  const taxBreakdown = summariseTaxBreakdown(sale.taxLines ?? [])

  // Prepare receipt data
  const receiptData = {
    receiptNumber: sale.id.slice(0, 8).toUpperCase(),
    date: formatDate(sale.createdAt),
    time: new Date(sale.createdAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    tenantName: tenant.name,
    branchName: branchName || undefined,
    tenantPhone: tenant.phone || undefined,
    customerName: sale.customer?.name,
    items: sale.items.map((saleItem) => ({
      name: saleItem.item.name,
      manufacturer: saleItem.item.manufacturer ?? undefined,
      quantity: saleItem.quantity,
      price: saleItem.price,
      total: saleItem.lineTotalAmount ?? saleItem.price * saleItem.quantity,
    })),
    subtotal: sale.subtotalAmount ?? sale.totalAmount,
    // Was hardcoded to 0, so every discount was invisible on the printed
    // receipt and the listed line prices never reconciled with the total.
    discount: sale.items.reduce((sum, si) => sum + (si.discountAmount ?? 0), 0),
    taxLines: taxBreakdown,
    total: sale.totalAmount,
    paidAmount: sale.paidAmount,
    change: changeAmount,
    paymentType: creditAmount > 0
      ? 'CREDIT'
      : sale.paymentMethod === 'MOMO'
        ? 'MOMO'
        : sale.paymentMethod === 'BANK'
          ? 'BANK'
          : 'CASH',
    showManufacturer: tenant.showManufacturerOnReceipt,
  }

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          onClick={() => router.push(`/sales/${sale.id}/edit`)}
          className="px-5 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-2"
        >
          <Pencil className="w-4 h-4" />
          Edit Sale
        </button>
        <button
          onClick={() => setShowReturnModal(true)}
          className="px-5 py-3 bg-orange-50 text-orange-700 border border-orange-200 font-semibold hover:bg-orange-100 transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Process Return
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          {showPreview ? (
            <>
              <EyeOff className="w-5 h-5" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="w-5 h-5" />
              Show Preview
            </>
          )}
        </button>
        <button
          onClick={() => router.push(`/waybills/new?saleId=${sale.id}&consigneeName=${encodeURIComponent(sale.customer?.name ?? '')}`)}
          className="px-5 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-2"
        >
          <Truck className="w-4 h-4" />
          Create Waybill
        </button>
        {/* The void endpoint existed but was unreachable from any screen, so the
            void_sales permission was dead. */}
        {canVoid && (
          <button
            onClick={voidSale}
            disabled={isVoiding}
            className="px-5 py-3 bg-red-50 text-red-700 border border-red-200 font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {isVoiding ? 'Voiding…' : 'Void Sale'}
          </button>
        )}
        <button
          onClick={printReceipt}
          className="px-5 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg"
        >
          <Printer className="w-5 h-5" />
          Print Receipt
        </button>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          ⚠ {actionError}
        </div>
      )}

      {/* Sale Summary Card */}
      <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Sale Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-semibold text-gray-600">Sale ID:</span>
            <p className="text-base font-mono text-gray-900">
              {sale.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Date & Time:</span>
            <p className="text-base text-gray-900">
              {formatDate(sale.createdAt)} at{' '}
              {new Date(sale.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Customer:</span>
            <p className="text-base text-gray-900">
              {sale.customer ? (
                <Link
                  href={`/customers/${sale.customer.id}`}
                  className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                >
                  {sale.customer.name}
                </Link>
              ) : (
                'Walk-in Customer'
              )}
            </p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Items Count:</span>
            <p className="text-base text-gray-900">{sale.items.length} items</p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Payment Method:</span>
            <p className="text-base text-gray-900">
              {/* BANK previously fell through and displayed as "Cash" */}
              {sale.paymentMethod === 'MOMO' ? '📱 Mobile Money'
                : sale.paymentMethod === 'BANK' ? '🏦 Bank Transfer'
                : '💵 Cash'}
            </p>
            {sale.paymentMethod === 'MOMO' && sale.momoPhone && (
              <p className="text-xs text-gray-500 mt-0.5">{sale.momoPhone}</p>
            )}
            {sale.paymentMethod === 'BANK' && (sale.bankName || sale.bankReference) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {[sale.bankName, sale.bankReference].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Subtotal:</span>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(sale.subtotalAmount ?? sale.totalAmount)}
            </p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Total Amount:</span>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(sale.totalAmount)}
            </p>
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-600">Paid Amount:</span>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(sale.paidAmount)}
            </p>
          </div>
          {creditAmount > 0 && (
            <div>
              <span className="text-sm font-semibold text-gray-600">Credit Amount:</span>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(creditAmount)}
              </p>
            </div>
          )}
          {changeAmount > 0 && (
            <div>
              <span className="text-sm font-semibold text-gray-600">Change:</span>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(changeAmount)}
              </p>
            </div>
          )}
          {receiptData.discount > 0 && (
            <div>
              <span className="text-sm font-semibold text-gray-600">Discount:</span>
              <p className="text-xl font-bold text-amber-600">
                −{formatCurrency(receiptData.discount)}
              </p>
            </div>
          )}
        </div>
        {/* Captured at the till but previously never displayed anywhere */}
        {sale.note && (
          <div className="mt-5 border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-bold text-gray-700 mb-1">Note</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{sale.note}</p>
          </div>
        )}
        {taxBreakdown.length > 0 && (
          <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-900 mb-3">Tax Breakdown</p>
            <div className="space-y-2">
              {taxBreakdown.map((taxLine) => (
                <div
                  key={`${taxLine.taxRateId ?? taxLine.taxName}-${taxLine.taxRatePercentage}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-emerald-900">
                    {formatTaxLabel(taxLine)}
                  </span>
                  <span className="font-bold text-emerald-950">
                    {formatCurrency(taxLine.taxAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white shadow-sm border-2 border-gray-200 overflow-hidden">
        <div className="p-6 border-b-2 border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Items Sold</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Subtotal
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Tax
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Line Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sale.items.map((saleItem) => (
                <tr key={saleItem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 text-base">
                      {saleItem.item.name}
                    </div>
                    {saleItem.item.manufacturer && (
                      <div className="text-sm font-semibold text-blue-600 mt-1">
                        📦 {saleItem.item.manufacturer.name}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-900 font-semibold">
                    {saleItem.quantity}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 font-semibold">
                    {formatCurrency(saleItem.price)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 font-bold">
                    {formatCurrency(saleItem.lineSubtotalAmount ?? saleItem.price * saleItem.quantity)}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-700 font-semibold">
                    {formatCurrency(saleItem.lineTaxAmount ?? 0)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 font-bold">
                    {formatCurrency(saleItem.lineTotalAmount ?? saleItem.price * saleItem.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Preview */}
      {showPreview && (
        <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Receipt Preview</h2>
            <div className="text-sm text-gray-600">
              Width: {tenant.receiptPrinterWidth}
            </div>
          </div>
          <div className="bg-gray-100 p-8 flex justify-center">
            <ThermalReceipt
              data={receiptData}
              width={tenant.receiptPrinterWidth as '58mm' | '80mm'}
            />
          </div>
          <p className="text-sm text-gray-600 text-center mt-4">
            This is how the receipt will appear when printed
          </p>
        </div>
      )}

      {/* Process Customer Return Modal */}
      {showReturnModal && (
        <CustomerReturnModal
          sale={sale}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            setShowReturnModal(false)
            router.push('/returns')
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Customer Return Modal                                                       */
/* -------------------------------------------------------------------------- */

interface CustomerReturnModalProps {
  sale: Sale
  onClose: () => void
  onSuccess: () => void
}

function CustomerReturnModal({ sale, onClose, onSuccess }: CustomerReturnModalProps) {
  const [selectedItemId, setSelectedItemId] = useState(sale.items[0]?.item.id ?? '')
  const [quantity, setQuantity] = useState(1)
  // Return every line at once. Without this a multi-line sale has to be
  // returned one item at a time, which is slow and easy to leave half done.
  const [returnWholeSale, setReturnWholeSale] = useState(false)
  const [returnType, setReturnType] = useState<'CASH' | 'CREDIT' | 'EXCHANGE'>('CASH')
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedSaleItem = sale.items.find(si => si.item.id === selectedItemId)

  // Auto-fill amount when item or qty changes
  const autoAmount = selectedSaleItem
    ? ((selectedSaleItem.lineTotalAmount / selectedSaleItem.quantity) * quantity).toFixed(2)
    : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const amountNum = parseFloat(amount)
    if (!returnWholeSale) {
      if (!selectedItemId) { setError('Select an item to return'); return }
      if (quantity <= 0) { setError('Quantity must be at least 1'); return }
      if (isNaN(amountNum) || amountNum < 0) { setError('Enter a valid refund amount'); return }
      if (selectedSaleItem && quantity > selectedSaleItem.quantity) {
        setError(`Max returnable: ${selectedSaleItem.quantity}`)
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (returnWholeSale) {
        // Bulk endpoint validates the whole refund against what was paid
        // before writing any line.
        const res = await fetch('/api/returns/customers/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saleId: sale.id,
            type: returnType,
            lines: sale.items.map(si => ({ itemId: si.item.id, quantity: si.quantity })),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Return failed')
        onSuccess()
        return
      }

      const res = await fetch('/api/returns/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: sale.id,
          itemId: selectedItemId,
          quantity,
          type: returnType,
          amount: amountNum,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Return failed')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process return')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Process Customer Return</h3>
            <p className="text-xs text-gray-500 mt-0.5">Sale #{sale.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Return everything, rather than one line at a time. */}
          <label className="flex items-start gap-2.5 p-3 border-2 border-gray-200 cursor-pointer hover:border-blue-300">
            <input
              type="checkbox"
              checked={returnWholeSale}
              onChange={e => setReturnWholeSale(e.target.checked)}
              className="w-4 h-4 mt-0.5 shrink-0"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Return the entire sale</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {sale.items.length === 1
                  ? 'The one line, at full quantity'
                  : `All ${sale.items.length} lines at full quantity`}
                {' — '}
                {formatCurrency(sale.items.reduce((t, si) => t + si.lineTotalAmount, 0))}
              </span>
            </span>
          </label>

          {returnWholeSale ? (
            <div className="border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {sale.items.map(si => (
                <div key={si.item.id} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="flex-1 min-w-0 truncate">{si.quantity} × {si.item.name}</span>
                  <span className="font-semibold shrink-0">{formatCurrency(si.lineTotalAmount)}</span>
                </div>
              ))}
            </div>
          ) : (
          <>
          {/* Item selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item to Return</label>
            <select
              value={selectedItemId}
              onChange={e => { setSelectedItemId(e.target.value); setQuantity(1); setAmount('') }}
              className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-sm"
            >
              {sale.items.map(si => (
                <option key={si.item.id} value={si.item.id}>
                  {si.item.name} (sold: {si.quantity} × {formatCurrency(si.price)} | total {formatCurrency(si.lineTotalAmount)})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Quantity
              {selectedSaleItem && (
                <span className="text-xs font-normal text-gray-400 ml-2">max {selectedSaleItem.quantity}</span>
              )}
            </label>
            <div className="flex items-center border-2 border-gray-200 overflow-hidden bg-white">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg border-r border-gray-200">−</button>
              <input
                type="number" min={1} max={selectedSaleItem?.quantity}
                value={quantity}
                onChange={e => { setQuantity(parseInt(e.target.value) || 1); setAmount('') }}
                className="flex-1 text-center font-bold text-gray-900 focus:outline-none py-2.5 text-base"
              />
              <button type="button" onClick={() => setQuantity(q => q + 1)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg border-l border-gray-200">+</button>
            </div>
          </div>

          </>
          )}

          {/* Return type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Return Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'CREDIT', 'EXCHANGE'] as const).map(t => (
                <button key={t} type="button" onClick={() => setReturnType(t)}
                  className={`py-2.5 text-xs font-bold border-2 transition-colors ${
                    returnType === t
                      ? t === 'CASH' ? 'bg-green-600 text-white border-green-600'
                        : t === 'CREDIT' ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {t === 'CASH' ? '💵 Cash' : t === 'CREDIT' ? '📋 Credit' : '🔄 Exchange'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {returnType === 'CASH' ? 'Refund cash to customer'
                : returnType === 'CREDIT' ? 'Credit customer account (reduces balance)'
                : 'Exchange for another item (no balance change)'}
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Refund Amount (GH₵)
            </label>
            <div className="relative">
              <input
                type="number" step="0.01" min="0"
                value={amount}
                placeholder={autoAmount}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-lg font-bold"
              />
              {autoAmount && !amount && (
                <button type="button" onClick={() => setAmount(autoAmount)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-600 font-semibold hover:underline">
                  Use {formatCurrency(parseFloat(autoAmount))}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
              ⚠ {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-3 bg-orange-600 text-white font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Processing…' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
