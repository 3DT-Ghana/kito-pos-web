'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { getReasonsForType, type AdjustmentReason } from '@/lib/adjustments/reasons'
import { isInventoryItemType, itemTypeLabel } from '@/lib/items/type'

type AdjustType = 'add' | 'remove' | 'set'

const TYPE_CONFIG: Record<AdjustType, { label: string; icon: string; color: string; activeColor: string; desc: string }> = {
  add:    { label: 'Add Stock',    icon: '+', color: 'border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50',  activeColor: 'border-green-500 bg-green-600 text-white',  desc: 'Stock received: delivery, production, found, return' },
  remove: { label: 'Remove Stock', icon: '−', color: 'border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50',     activeColor: 'border-red-500 bg-red-600 text-white',     desc: 'Stock lost: damage, expiry, theft, supplier return' },
  set:    { label: 'Set Quantity', icon: '=', color: 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50',   activeColor: 'border-blue-500 bg-blue-600 text-white',   desc: 'Override stock count after physical stocktake' },
}

export default function AdjustQuantityPage() {
  const router = useRouter()
  const params = useParams()
  const itemId = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [item, setItem] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissionState, setSubmissionState] = useState<'idle' | 'success' | 'pending'>('idle')

  const [adjustType, setAdjustType] = useState<AdjustType>('add')
  const [quantity, setQuantity] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [reason, setReason] = useState('')

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${itemId}`)
      if (!res.ok) throw new Error('Failed to fetch item')
      const data = await res.json()
      setItem(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item')
    } finally {
      setIsLoading(false)
    }
  }, [itemId])

  useEffect(() => { fetchItem() }, [fetchItem])

  // Reset category when type changes
  useEffect(() => { setSelectedCategory('') }, [adjustType])

  const qty = Number(quantity)
  const isValidQty = quantity !== '' && !isNaN(qty) && qty >= 0 && (adjustType === 'set' || qty > 0)

  const previewQty = isValidQty && item
    ? adjustType === 'add'   ? item.quantity + qty
    : adjustType === 'remove' ? item.quantity - qty
    : qty
    : null

  const stockType: 'INCREASE' | 'DECREASE' =
    adjustType === 'add' ? 'INCREASE'
    : adjustType === 'remove' ? 'DECREASE'
    : previewQty !== null && item
      ? previewQty >= item.quantity ? 'INCREASE' : 'DECREASE'
      : 'INCREASE'

  const reasonOptions: AdjustmentReason[] = getReasonsForType(stockType)
  const selectedReasonMeta = reasonOptions.find(r => r.key === selectedCategory)

  const canSubmit =
    isValidQty &&
    selectedCategory !== '' &&
    reason.trim().length >= 3 &&
    !isSubmitting &&
    !(adjustType === 'remove' && item && qty > item.quantity)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    try {
      setIsSubmitting(true)
      setError(null)
      setSubmissionState('idle')
      const res = await fetch(`/api/items/${itemId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adjustType,
          quantity: qty,
          category: selectedCategory,
          reason: reason.trim(),
        }),
      })

      const result = await res.json()

      if (res.status === 202 && result.requiresApproval) {
        setSubmissionState('pending')
        setTimeout(() => router.push(`/items/${itemId}`), 1500)
        return
      }

      if (!res.ok) {
        const err = result
        throw new Error(err.error || 'Failed to adjust quantity')
      }

      setSubmissionState('success')
      setTimeout(() => router.push(`/items/${itemId}`), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust quantity')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-16 text-gray-400">Loading…</div>
      </AppLayout>
    )
  }

  if (error && !item) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error}</div>
      </AppLayout>
    )
  }

  if (item && !isInventoryItemType(item.itemType)) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto space-y-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/items/${itemId}`)}
              className="p-2 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Adjust Stock</h1>
              <p className="text-sm text-gray-500">{item.name}</p>
            </div>
          </div>

          <div className="border border-sky-200 bg-sky-50 p-5 text-sky-900">
            <p className="font-semibold">{itemTypeLabel(item.itemType)} items do not use stock adjustments.</p>
            <p className="mt-1 text-sm text-sky-800">
              This item stays in the catalog, but quantity on hand is only tracked for inventory items.
            </p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/items/${itemId}`)}
            className="p-2 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Adjust Stock</h1>
            <p className="text-sm text-gray-500">{item?.name}</p>
          </div>
        </div>

        {/* Current stock card */}
        <div className="bg-white border-2 border-gray-100 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Current Stock</p>
            <p className="text-4xl font-black text-gray-900 mt-1">{item?.quantity ?? 0}</p>
            {item?.manufacturer?.name && (
              <p className="text-xs text-gray-400 mt-1">{item.manufacturer.name}</p>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Cost / Sell</p>
            <p className="text-sm font-semibold text-gray-600">{formatCurrency(item?.costPrice ?? 0)}</p>
            <p className="text-sm font-bold text-blue-600">{formatCurrency(item?.sellingPrice ?? 0)}</p>
          </div>
        </div>

        {/* Main form */}
        <div className="bg-white border-2 border-gray-100 p-6 space-y-6">

          {/* Step 1 — Type */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              1 — What are you doing?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CONFIG) as AdjustType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setAdjustType(t); setError(null) }}
                  className={`flex flex-col items-center gap-1 py-3 px-2 border-2 font-semibold text-sm transition-all ${
                    adjustType === t ? TYPE_CONFIG[t].activeColor : TYPE_CONFIG[t].color
                  }`}
                >
                  <span className="text-xl font-black">{TYPE_CONFIG[t].icon}</span>
                  <span className="text-xs leading-tight text-center">{TYPE_CONFIG[t].label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">{TYPE_CONFIG[adjustType].desc}</p>
          </div>

          {/* Step 2 — Quantity */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              2 — {adjustType === 'set' ? 'New target quantity' : 'How many units?'}
            </p>
            <input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={e => { setQuantity(e.target.value); setError(null) }}
              placeholder={adjustType === 'set' ? 'Enter exact stock count' : 'Enter quantity'}
              className="w-full px-4 py-3 border-2 border-gray-200 text-2xl font-bold focus:border-blue-500 focus:outline-none"
            />

            {/* Live preview */}
            {isValidQty && previewQty !== null && (
              <div className={`mt-3 p-4 flex items-center justify-between border-2 ${
                previewQty < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="text-sm text-gray-600 font-medium">
                  <span className="font-bold text-gray-800">{item.quantity}</span>
                  {adjustType === 'add'    && <span className="text-green-600 font-bold"> + {qty}</span>}
                  {adjustType === 'remove' && <span className="text-red-600 font-bold"> − {qty}</span>}
                  {adjustType === 'set'    && <span className="text-blue-600 font-bold"> → set to</span>}
                </div>
                <div className={`text-2xl font-black ${
                  previewQty < 0 ? 'text-red-600' : previewQty === 0 ? 'text-gray-400' : 'text-gray-900'
                }`}>
                  {previewQty}
                  <span className="text-sm font-semibold text-gray-400 ml-1">units</span>
                </div>
              </div>
            )}

            {adjustType === 'remove' && item && isValidQty && qty > item.quantity && (
              <p className="mt-2 text-sm text-red-600 font-semibold">
                ⚠ Cannot remove {qty} — only {item.quantity} in stock
              </p>
            )}
          </div>

          {/* Step 3 — Reason Category */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              3 — Why are you adjusting?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {reasonOptions.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSelectedCategory(r.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 border-2 text-left text-sm font-semibold transition-all ${
                    selectedCategory === r.key
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50/40'
                  }`}
                >
                  <span className="text-base shrink-0">{r.icon}</span>
                  <span className="leading-tight">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 4 — Notes */}
          {selectedCategory && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                4 — Add details <span className="font-normal normal-case text-gray-400">(required)</span>
              </p>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={selectedReasonMeta?.placeholder ?? 'Describe the reason…'}
                className="w-full px-4 py-3 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{reason.trim().length} characters (min 3)</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          )}

          {submissionState === 'success' && (
            <div className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <span>✓</span> Stock updated! Redirecting…
            </div>
          )}

          {submissionState === 'pending' && (
            <div className="bg-amber-50 border-2 border-amber-200 text-amber-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <span>⏳</span> Adjustment submitted for approval. Stock will update after approval.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => router.push(`/items/${itemId}`)}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`flex-1 py-3 font-bold text-white transition-all active:scale-95 ${
                !canSubmit
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : adjustType === 'add'
                  ? 'bg-green-600 hover:bg-green-700'
                  : adjustType === 'remove'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? 'Saving…' : TYPE_CONFIG[adjustType].label}
            </button>
          </div>

          {/* Progress hint */}
          {!canSubmit && submissionState === 'idle' && (
            <p className="text-xs text-center text-gray-400">
              {!isValidQty ? 'Enter a quantity' :
               !selectedCategory ? 'Select a reason category' :
               reason.trim().length < 3 ? 'Add a short note (min 3 chars)' : ''}
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
