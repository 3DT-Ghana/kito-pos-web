'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ADJUSTMENT_REASONS, type AdjustmentReason } from '@/lib/adjustments/reasons'
import { isInventoryItemType } from '@/lib/items/type'

interface Item {
  id: string
  name: string
  itemType: 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'
  quantity: number
  costPrice: number
  sellingPrice: number
  manufacturer: { id: string; name: string } | null
}

interface RowState {
  type: 'add' | 'remove' | 'set'
  qty: string
  category: string
  reason: string
  dirty: boolean
  saving: boolean
  error: string
  saved: boolean
  pending: boolean
}

const REASONS_ADD    = ADJUSTMENT_REASONS.filter(r => r.types.includes('INCREASE') || r.types.includes('both'))
const REASONS_REMOVE = ADJUSTMENT_REASONS.filter(r => r.types.includes('DECREASE') || r.types.includes('both'))
const REASONS_SET    = ADJUSTMENT_REASONS.filter(r => r.types.includes('both'))

function reasonsForType(type: 'add' | 'remove' | 'set'): AdjustmentReason[] {
  if (type === 'add')    return REASONS_ADD
  if (type === 'remove') return REASONS_REMOVE
  return REASONS_SET
}

export default function BulkAdjustItemsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/items')
      .then(r => r.json())
      .then(data => {
        const list: Item[] = (Array.isArray(data) ? data : data.data || []).filter((item: Item) =>
          isInventoryItemType(item.itemType)
        )
        setItems(list)
        const initial: Record<string, RowState> = {}
        list.forEach(item => {
          initial[item.id] = { type: 'add', qty: '', category: '', reason: '', dirty: false, saving: false, error: '', saved: false, pending: false }
        })
        setRows(initial)
      })
      .finally(() => setLoading(false))
  }, [])

  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const previewQty = (item: Item, row: RowState): number | null => {
    const qty = parseFloat(row.qty)
    if (isNaN(qty) || qty < 0 || row.qty === '') return null
    if (row.type === 'add') return item.quantity + qty
    if (row.type === 'remove') return Math.max(0, item.quantity - qty)
    return qty
  }

  const isRowValid = (row: RowState) =>
    row.dirty && row.qty !== '' && row.category !== '' && row.reason.trim().length >= 3

  const saveRow = async (item: Item) => {
    const row = rows[item.id]
    if (!isRowValid(row)) return
    setRow(item.id, { saving: true, error: '' })
    try {
      const res = await fetch(`/api/items/${item.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: row.type,
          quantity: parseFloat(row.qty),
          category: row.category,
          reason: row.reason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (data.requiresApproval) {
        setRow(item.id, {
          saving: false,
          dirty: false,
          qty: '',
          category: '',
          reason: '',
          saved: false,
          pending: true,
          error: '',
        })
      } else {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: data.quantity } : i))
        setRow(item.id, {
          saving: false,
          dirty: false,
          qty: '',
          category: '',
          reason: '',
          saved: true,
          pending: false,
          error: '',
        })
      }
      setExpandedRow(null)
      setTimeout(() => setRow(item.id, { saved: false, pending: false }), 3000)
    } catch (err) {
      setRow(item.id, { saving: false, error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const saveAll = async () => {
    const dirtyItems = items.filter(i => isRowValid(rows[i.id]))
    if (dirtyItems.length === 0) return
    setIsSavingAll(true)
    for (const item of dirtyItems) await saveRow(item)
    setIsSavingAll(false)
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return !q || i.name.toLowerCase().includes(q) || (i.manufacturer?.name || '').toLowerCase().includes(q)
  })

  const dirtyCount   = Object.values(rows).filter(r => r.dirty && r.qty !== '').length
  const readyCount   = items.filter(i => isRowValid(rows[i.id])).length

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/items')} className="p-2 hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Bulk Stock Adjustment</h1>
              <p className="text-sm text-gray-500">Adjust quantity, pick a reason, then save row-by-row or all at once</p>
            </div>
          </div>
          {readyCount > 0 && (
            <button
              onClick={saveAll}
              disabled={isSavingAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60 text-sm shadow-md"
            >
              {isSavingAll ? 'Saving…' : `Save All (${readyCount})`}
            </button>
          )}
          {dirtyCount > readyCount && (
            <p className="text-xs text-amber-600 font-semibold">
              {dirtyCount - readyCount} row{dirtyCount - readyCount !== 1 ? 's' : ''} missing reason — expand to complete
            </p>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-indigo-500 focus:outline-none text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden divide-y divide-gray-100">

            {/* Column header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
              <div>Item</div>
              <div className="text-right">Stock</div>
              <div className="w-36">Type</div>
              <div className="w-24">Qty</div>
              <div className="w-20 text-right">New</div>
              <div className="w-20"></div>
            </div>

            {filtered.map(item => {
              const row = rows[item.id]
              if (!row) return null
              const preview = previewQty(item, row)
              const isExpanded = expandedRow === item.id
              const reasons = reasonsForType(row.type)
              const selectedReason = reasons.find(r => r.key === row.category)
              const rowReady = isRowValid(row)

              return (
                <div
                  key={item.id}
                  className={`transition-colors ${
                    row.saved ? 'bg-green-50'
                    : row.pending ? 'bg-amber-50'
                    : rowReady ? 'bg-indigo-50/30'
                    : row.dirty ? 'bg-amber-50/30'
                    : ''
                  }`}
                >
                  {/* Main row */}
                  <div className="flex flex-col md:grid md:grid-cols-[2fr_1fr_auto_auto_auto_auto] gap-3 items-start md:items-center px-4 py-3">

                    {/* Name */}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400 truncate">{item.manufacturer?.name || '—'}</p>
                    </div>

                    {/* Current stock */}
                    <div className="text-right hidden md:block">
                      <span className={`font-bold text-sm ${item.quantity === 0 ? 'text-red-600' : item.quantity <= 10 ? 'text-amber-600' : 'text-gray-900'}`}>
                        {item.quantity}
                      </span>
                    </div>

                    {/* Type toggle */}
                    <div className="flex border-2 border-gray-200 overflow-hidden text-xs font-semibold w-36">
                      {(['add', 'remove', 'set'] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => {
                            setRow(item.id, { type: t, category: '', dirty: row.qty !== '', saved: false, pending: false })
                          }}
                          className={`flex-1 py-1.5 transition-colors ${row.type === t
                            ? t === 'add' ? 'bg-green-500 text-white'
                              : t === 'remove' ? 'bg-red-500 text-white'
                              : 'bg-blue-500 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                          }`}>
                          {t}
                        </button>
                      ))}
                    </div>

                    {/* Qty input */}
                    <input
                      type="number"
                      min="0"
                      value={row.qty}
                      onChange={e => {
                        const val = e.target.value
                        setRow(item.id, { qty: val, dirty: val !== '', saved: false, pending: false, error: '' })
                        if (val !== '' && expandedRow !== item.id) setExpandedRow(item.id)
                      }}
                      placeholder="0"
                      className="w-24 px-2 py-1.5 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
                    />

                    {/* Preview */}
                    <div className="w-20 text-right hidden md:block">
                      {preview !== null ? (
                        <span className={`font-bold text-sm ${preview === 0 ? 'text-red-600' : preview <= 10 ? 'text-amber-600' : 'text-green-700'}`}>
                          → {preview}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 w-20 justify-end">
                      {row.error && <p className="text-xs text-red-600 hidden md:block">{row.error}</p>}
                      {row.saved ? (
                        <span className="text-xs text-green-600 font-semibold">✓ Saved</span>
                      ) : row.pending ? (
                        <span className="text-xs text-amber-700 font-semibold">Awaiting approval</span>
                      ) : row.dirty ? (
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                          className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                            rowReady
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                        >
                          {isExpanded ? 'Close' : rowReady ? 'Save' : 'Reason ↓'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Expanded reason panel */}
                  {isExpanded && row.dirty && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3 bg-white/60">

                      {/* Reason category grid */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                          Why are you adjusting? <span className="text-red-400">*</span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                          {reasons.map(r => (
                            <button
                              key={r.key}
                              type="button"
                              onClick={() => setRow(item.id, { category: r.key })}
                              className={`flex items-center gap-2 px-2.5 py-2 border-2 text-left text-xs font-semibold transition-all ${
                                row.category === r.key
                                  ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                                  : 'border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/40'
                              }`}
                            >
                              <span className="shrink-0">{r.icon}</span>
                              <span className="leading-tight">{r.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Notes textarea */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                          Notes <span className="text-red-400">*</span>
                          <span className="font-normal normal-case text-gray-400 ml-1">(min 3 chars)</span>
                        </p>
                        <textarea
                          rows={2}
                          value={row.reason}
                          onChange={e => setRow(item.id, { reason: e.target.value })}
                          placeholder={selectedReason?.placeholder ?? 'Describe the reason…'}
                          className="w-full px-3 py-2 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                        />
                      </div>

                      {row.error && (
                        <p className="text-xs text-red-600 font-semibold">{row.error}</p>
                      )}

                      {/* Save button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => saveRow(item)}
                          disabled={!rowReady || row.saving}
                          className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {row.saving ? 'Saving…' : 'Save Adjustment'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold">No items found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
