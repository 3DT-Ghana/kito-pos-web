'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ArrowLeft, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { useRolePermissions } from '@/hooks/useTenant'

interface PurchaseItem {
  id: string
  itemId: string
  quantity: number
  costPrice: number
  item: {
    id: string
    name: string
    manufacturer?: { id: string; name: string } | null
  }
}

interface Purchase {
  id: string
  supplierId: string
  totalAmount: number
  paidAmount: number
  paymentType: string
  createdAt: string
  supplier: { id: string; name: string; balance: number }
  items: PurchaseItem[]
}

export default function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [isVoiding, setIsVoiding] = useState(false)
  const [actionError, setActionError] = useState('')

  const { user } = useUser()
  const { hasTenantPermission, isLoading: permissionsLoading } = useRolePermissions()
  const canVoid = !permissionsLoading && hasTenantPermission(user?.role, 'void_purchases')
  const canEdit = user?.role === 'OWNER'

  const voidPurchase = async () => {
    if (!confirm(
      'Void this purchase?\n\nStock will be removed and the supplier balance adjusted. This cannot be undone.'
    )) return
    setIsVoiding(true)
    setActionError('')
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to void purchase')
      router.push('/purchases')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to void purchase')
      setIsVoiding(false)
    }
  }

  useEffect(() => {
    fetch(`/api/purchases/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setPurchase(data)
      })
      .catch(e => setError(e.message || 'Failed to load purchase'))
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent -full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (error || !purchase) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-red-600 font-semibold">{error || 'Purchase not found'}</p>
          <button onClick={() => router.push('/purchases')} className="mt-4 text-blue-600 underline text-sm">
            Back to Purchases
          </button>
        </div>
      </AppLayout>
    )
  }

  const creditAmount = purchase.totalAmount - purchase.paidAmount

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/purchases')} className="p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Purchase Details</h1>
            <p className="text-gray-500 font-mono text-sm mt-0.5">#{purchase.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowReturnModal(true)}
              className="px-5 py-3 bg-orange-50 text-orange-700 border border-orange-200 font-semibold hover:bg-orange-100 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Process Return
            </button>
            {/* Editing is OWNER-only server-side; showing it to everyone meant
                filling the whole form and only then getting a 403. */}
            {canEdit && (
              <button
                onClick={() => router.push(`/purchases/${id}/edit`)}
                className="px-5 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit Purchase
              </button>
            )}
            {/* The void endpoint was fully implemented but unreachable from any
                screen, leaving void_purchases dead. */}
            {canVoid && (
              <button
                onClick={voidPurchase}
                disabled={isVoiding}
                className="px-5 py-3 bg-red-50 text-red-700 border border-red-200 font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {isVoiding ? 'Voiding…' : 'Void Purchase'}
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            ⚠ {actionError}
          </div>
        )}

        {/* Purchase Summary Card */}
        <div className="bg-white shadow-sm border-2 border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Purchase Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-semibold text-gray-600">Supplier:</span>
              <p className="text-base font-bold text-gray-900 mt-0.5">{purchase.supplier.name}</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-600">Date:</span>
              <p className="text-base text-gray-900 mt-0.5">{formatDate(purchase.createdAt)}</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-600">Payment Type:</span>
              <p className="mt-0.5">
                <span className={`inline-block px-2.5 py-0.5 -full text-xs font-bold ${
                  purchase.paymentType === 'CASH' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {purchase.paymentType === 'CASH' ? '✓ Paid in Full' : '📦 Credit Purchase'}
                </span>
              </p>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-600">Items Count:</span>
              <p className="text-base text-gray-900 mt-0.5">{purchase.items.length} item(s)</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-600">Total Amount:</span>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(purchase.totalAmount)}</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-600">Paid Amount:</span>
              <p className="text-xl font-bold text-green-600 mt-0.5">{formatCurrency(purchase.paidAmount)}</p>
            </div>
            {creditAmount > 0 && (
              <div>
                <span className="text-sm font-semibold text-gray-600">Owed to Supplier:</span>
                <p className="text-xl font-bold text-red-600 mt-0.5">{formatCurrency(creditAmount)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white shadow-sm border-2 border-gray-200 overflow-hidden">
          <div className="p-6 border-b-2 border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Items Purchased</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Item</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase">Cost Price</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchase.items.map(pi => (
                  <tr key={pi.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{pi.item.name}</p>
                      {pi.item.manufacturer && (
                        <p className="text-sm text-blue-600 font-medium mt-0.5">📦 {pi.item.manufacturer.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-gray-900">{pi.quantity}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(pi.costPrice)}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {formatCurrency(pi.costPrice * pi.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Total</td>
                  <td className="px-6 py-3 text-right text-lg font-bold text-gray-900">
                    {formatCurrency(purchase.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Supplier Return Modal */}
        {showReturnModal && (
          <SupplierReturnModal
            purchase={purchase}
            onClose={() => setShowReturnModal(false)}
            onSuccess={() => {
              setShowReturnModal(false)
              router.push('/returns')
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}

/* -------------------------------------------------------------------------- */
/* Supplier Return Modal                                                       */
/* -------------------------------------------------------------------------- */

interface SupplierReturnModalProps {
  purchase: Purchase
  onClose: () => void
  onSuccess: () => void
}

function SupplierReturnModal({ purchase, onClose, onSuccess }: SupplierReturnModalProps) {
  const [selectedItemId, setSelectedItemId] = useState(purchase.items[0]?.item.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [returnType, setReturnType] = useState<'CASH' | 'CREDIT' | 'EXCHANGE'>('CASH')
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedItem = purchase.items.find(pi => pi.item.id === selectedItemId)
  const autoAmount = selectedItem ? (selectedItem.costPrice * quantity).toFixed(2) : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedItemId) { setError('Select an item to return'); return }
    if (quantity <= 0) { setError('Quantity must be at least 1'); return }
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < 0) { setError('Enter a valid credit amount'); return }
    if (selectedItem && quantity > selectedItem.quantity) {
      setError(`Max returnable: ${selectedItem.quantity}`)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/returns/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId: purchase.id,
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
            <h3 className="text-lg font-bold text-gray-900">Process Supplier Return</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Purchase #{purchase.id.slice(0, 8).toUpperCase()} · {purchase.supplier.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Item selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item to Return</label>
            <select
              value={selectedItemId}
              onChange={e => { setSelectedItemId(e.target.value); setQuantity(1); setAmount('') }}
              className="w-full px-3 py-2.5 border-2 border-gray-200 focus:border-orange-500 focus:outline-none text-sm"
            >
              {purchase.items.map(pi => (
                <option key={pi.item.id} value={pi.item.id}>
                  {pi.item.name} (purchased: {pi.quantity} × {formatCurrency(pi.costPrice)})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Quantity
              {selectedItem && (
                <span className="text-xs font-normal text-gray-400 ml-2">max {selectedItem.quantity}</span>
              )}
            </label>
            <div className="flex items-center border-2 border-gray-200 overflow-hidden bg-white">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg border-r border-gray-200">−</button>
              <input
                type="number" min={1} max={selectedItem?.quantity}
                value={quantity}
                onChange={e => { setQuantity(parseInt(e.target.value) || 1); setAmount('') }}
                className="flex-1 text-center font-bold text-gray-900 focus:outline-none py-2.5 text-base"
              />
              <button type="button" onClick={() => setQuantity(q => q + 1)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 font-bold text-lg border-l border-gray-200">+</button>
            </div>
          </div>

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
              {returnType === 'CASH' ? 'Supplier refunds cash to you'
                : returnType === 'CREDIT' ? 'Reduces amount owed to supplier'
                : 'Exchange for different items (no balance change)'}
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Credit Amount (GH₵)
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
