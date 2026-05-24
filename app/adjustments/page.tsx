'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useItems } from '@/hooks/useItems'
import { formatDate } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { isInventoryItemType } from '@/lib/items/type'
import {
  ADJUSTMENT_REASONS,
  getReasonsForType,
  getReasonByKey,
  type AdjustmentReason,
} from '@/lib/adjustments/reasons'

interface StockAdjustment {
  id: string
  type: 'INCREASE' | 'DECREASE'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  category: string
  quantity: number
  previousQuantity: number
  newQuantity: number
  reason: string
  createdAt: string
  item: { id: string; name: string }
  user: { name: string } | null
}

interface Summary {
  total: number
  totalIncrease: number
  totalDecrease: number
  netChange: number
}

// ── Inline form state ─────────────────────────────────────────────────────────
interface FormState {
  itemId: string
  type: 'INCREASE' | 'DECREASE'
  category: string
  quantity: string
  reason: string
}

const EMPTY_FORM: FormState = {
  itemId: '', type: 'INCREASE', category: '', quantity: '', reason: '',
}

// ── Filters ───────────────────────────────────────────────────────────────────
interface Filters {
  type: string
  category: string
  startDate: string
  endDate: string
  search: string
}

const EMPTY_FILTERS: Filters = { type: '', category: '', startDate: '', endDate: '', search: '' }

function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`border-2 p-4 ${color}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
    </div>
  )
}

export default function StockAdjustmentsPage() {
  const { currentBranchId } = useBranch()
  const { items, refetch: refetchItems } = useItems()
  const stockItems = items.filter(item => isInventoryItemType(item.itemType))

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, totalIncrease: 0, totalDecrease: 0, netChange: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState(false)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const selectedItem = stockItems.find(i => i.id === form.itemId)
  const formReasonOptions: AdjustmentReason[] = getReasonsForType(form.type)
  const formReasonMeta = formReasonOptions.find(r => r.key === form.category)

  const fetchAdjustments = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (filters.type)      params.set('type', filters.type)
      if (filters.category)  params.set('category', filters.category)
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate)   params.set('endDate', filters.endDate)

      const res = await fetch(`/api/adjustments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAdjustments(data.adjustments || [])
      setSummary(data.summary || { total: 0, totalIncrease: 0, totalDecrease: 0, netChange: 0 })
    } catch {
      // silently fall through — table stays empty
    } finally {
      setIsLoading(false)
    }
  }, [filters.type, filters.category, filters.startDate, filters.endDate])

  useEffect(() => { fetchAdjustments() }, [fetchAdjustments, currentBranchId])

  // Reset category when type changes in the form
  useEffect(() => {
    setForm(prev => ({ ...prev, category: '' }))
  }, [form.type])

  const handleSubmit = async () => {
    const qty = Number(form.quantity)
    if (!form.itemId)       return setFormError('Select an item')
    if (!qty || qty <= 0)   return setFormError('Enter a valid quantity')
    if (!form.category)     return setFormError('Select a reason category')
    if (form.reason.trim().length < 3) return setFormError('Add a short note (min 3 chars)')

    setIsSubmitting(true)
    setFormError(null)
    setFormNotice(null)
    setFormSuccess(false)
    try {
      const res = await fetch('/api/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: form.itemId,
          type: form.type,
          category: form.category,
          quantity: qty,
          reason: form.reason.trim(),
        }),
      })

      const result = await res.json()

      if (res.status === 202 && result.requiresApproval) {
        setFormNotice(result.message ?? 'Adjustment submitted for approval.')
        setForm(EMPTY_FORM)
        setTimeout(() => {
          setShowForm(false)
          setFormNotice(null)
        }, 1800)
        fetchAdjustments()
        return
      }

      if (!res.ok) {
        const err = result
        throw new Error(err.error || 'Failed to save')
      }
      setFormSuccess(true)
      setForm(EMPTY_FORM)
      setTimeout(() => {
        setFormSuccess(false)
        setShowForm(false)
      }, 1500)
      fetchAdjustments()
      refetchItems()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Client-side search filter
  const visible = adjustments.filter(a => {
    if (!filters.search) return true
    const q = filters.search.toLowerCase()
    return (
      a.item.name.toLowerCase().includes(q) ||
      a.reason.toLowerCase().includes(q) ||
      (a.user?.name ?? '').toLowerCase().includes(q)
    )
  })

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Stock Adjustments</h1>
            <p className="text-sm text-gray-500 mt-0.5">Full audit trail of all manual inventory changes</p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(null); setFormSuccess(false) }}
            className={`px-5 py-2.5 font-bold text-sm flex items-center gap-2 transition-all ${
              showForm
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {showForm ? '✕ Cancel' : '+ New Adjustment'}
          </button>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Records" value={summary.total} color="bg-gray-50 border-gray-200 text-gray-800" />
          <StatCard label="Total Added" value={`+${summary.totalIncrease}`} color="bg-green-50 border-green-200 text-green-800" />
          <StatCard label="Total Removed" value={`−${summary.totalDecrease}`} color="bg-red-50 border-red-200 text-red-800" />
          <StatCard
            label="Net Change"
            value={summary.netChange >= 0 ? `+${summary.netChange}` : `${summary.netChange}`}
            color={summary.netChange >= 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-orange-50 border-orange-200 text-orange-800'}
          />
        </div>

        {/* ── New Adjustment Form ──────────────────────────────────────────── */}
        {showForm && (
          <div className="bg-white border-2 border-gray-100 p-6 space-y-6">
            <h2 className="text-lg font-bold text-gray-900">New Stock Adjustment</h2>

            {/* Item + Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Item *</label>
                <select
                  value={form.itemId}
                  onChange={e => setForm(prev => ({ ...prev, itemId: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select item…</option>
                  {stockItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (Stock: {item.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Direction *</label>
                <div className="flex gap-2">
                  {(['INCREASE', 'DECREASE'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, type: t }))}
                      className={`flex-1 py-2.5 border-2 font-bold text-sm transition-all ${
                        form.type === t
                          ? t === 'INCREASE'
                            ? 'border-green-500 bg-green-600 text-white'
                            : 'border-red-500 bg-red-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t === 'INCREASE' ? '▲ Increase' : '▼ Decrease'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quantity + preview */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Quantity *</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                placeholder="Enter quantity"
                className="w-full px-4 py-3 border-2 border-gray-200 text-xl font-bold focus:border-blue-500 focus:outline-none"
              />
              {selectedItem && form.quantity && Number(form.quantity) > 0 && (
                <div className="mt-2 bg-gray-50 border-2 border-gray-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    <span className="font-bold">{selectedItem.quantity}</span>
                    {form.type === 'INCREASE'
                      ? <span className="text-green-600 font-bold"> + {Number(form.quantity)}</span>
                      : <span className="text-red-600 font-bold"> − {Number(form.quantity)}</span>
                    }
                  </span>
                  <span className="text-lg font-black text-gray-900">
                    = {form.type === 'INCREASE'
                      ? selectedItem.quantity + Number(form.quantity)
                      : selectedItem.quantity - Number(form.quantity)
                    } <span className="text-sm font-semibold text-gray-400">units</span>
                  </span>
                </div>
              )}
            </div>

            {/* Reason category */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Reason Category *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {formReasonOptions.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, category: r.key }))}
                    className={`flex items-center gap-2 px-3 py-2.5 border-2 text-left text-sm font-semibold transition-all ${
                      form.category === r.key
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-600 hover:border-blue-200'
                    }`}
                  >
                    <span className="text-base shrink-0">{r.icon}</span>
                    <span className="leading-tight">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            {form.category && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Notes * <span className="normal-case font-normal text-gray-400">(min 3 chars)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={formReasonMeta?.placeholder ?? 'Describe the reason…'}
                  className="w-full px-4 py-3 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
            )}

            {formError && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 text-sm font-semibold">
                {formError}
              </div>
            )}
            {formNotice && (
              <div className="bg-amber-50 border-2 border-amber-200 text-amber-700 px-4 py-3 text-sm font-semibold">
                {formNotice}
              </div>
            )}
            {formSuccess && (
              <div className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
                ✓ Adjustment saved successfully!
              </div>
            )}

            <div className="flex justify-end pt-2 border-t-2 border-gray-100">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {isSubmitting ? 'Saving…' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-2 border-gray-100 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Search item, reason, user…"
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="lg:col-span-2 px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              value={filters.type}
              onChange={e => setFilters(prev => ({ ...prev, type: e.target.value }))}
              className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">All types</option>
              <option value="INCREASE">▲ Increase</option>
              <option value="DECREASE">▼ Decrease</option>
            </select>
            <select
              value={filters.category}
              onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
              className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">All categories</option>
              {ADJUSTMENT_REASONS.map(r => (
                <option key={r.key} value={r.key}>{r.icon} {r.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="flex-1 min-w-0 px-2 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="flex-1 min-w-0 px-2 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-2 text-xs text-blue-600 hover:underline font-semibold"
            >
              ✕ Clear all filters
            </button>
          )}
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white border-2 border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center py-16 text-gray-400">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <span className="text-4xl">📋</span>
              <p className="font-semibold">No adjustments found</p>
              {hasActiveFilters && (
                <p className="text-sm">Try clearing the filters</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="text-left px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="text-center px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Before → After</th>
                    <th className="text-center px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Change</th>
                    <th className="text-center px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="text-left px-4 py-3 font-bold text-xs text-gray-500 uppercase tracking-wide">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map(adj => {
                    const meta = getReasonByKey(adj.category)
                    const isIncrease = adj.type === 'INCREASE'
                    return (
                      <tr key={adj.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {formatDate(adj.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800 max-w-40 truncate">
                          {adj.item.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold border ${
                            isIncrease
                              ? 'bg-green-50 border-green-200 text-green-800'
                              : 'bg-red-50 border-red-200 text-red-800'
                          }`}>
                            <span>{meta?.icon ?? '📝'}</span>
                            {meta?.label ?? adj.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-500 text-xs">
                            {adj.previousQuantity}
                            <span className="mx-1 text-gray-300">→</span>
                            <span className="font-bold text-gray-800">{adj.newQuantity}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-black text-base ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                            {isIncrease ? '+' : '−'}{adj.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-1 text-xs font-bold ${
                            adj.approvalStatus === 'PENDING'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : adj.approvalStatus === 'REJECTED'
                                ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {adj.approvalStatus === 'PENDING'
                              ? 'Pending'
                              : adj.approvalStatus === 'REJECTED'
                                ? 'Rejected'
                                : 'Applied'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-50">
                          <span className="line-clamp-2 text-xs">{adj.reason}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {adj.user?.name ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Row count footer */}
          {!isLoading && visible.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
              {visible.length} record{visible.length !== 1 ? 's' : ''}
              {hasActiveFilters && adjustments.length !== visible.length
                ? ` (filtered from ${adjustments.length})`
                : ''}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
