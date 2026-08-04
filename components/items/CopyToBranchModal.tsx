'use client'

import { useEffect, useMemo, useState } from 'react'
import { useBranch } from '@/lib/branch/BranchContext'
import { formatCurrency } from '@/lib/utils/format'

interface CopyableItem {
  id: string
  name: string
  sellingPrice: number
  manufacturer?: { name: string } | null
}

interface CopyToBranchModalProps {
  open: boolean
  items: CopyableItem[]
  onClose: () => void
  /** Called after a successful copy so the caller can refresh counts. */
  onCopied?: () => void
}

interface CopyResult {
  copied: number
  skipped: number
  errors: string[]
  targetBranchName?: string
}

/**
 * Copy item definitions from the current branch into another.
 *
 * Items are per branch, so a product sold in two branches is two rows. Typing
 * the second one by hand is how names drift — and a drifted name splits one
 * product into two in every company-wide report. Copying keeps them identical.
 */
export function CopyToBranchModal({ open, items, onClose, onCopied }: CopyToBranchModalProps) {
  const { branches, currentBranchId } = useBranch()
  const [targetBranchId, setTargetBranchId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [isCopying, setIsCopying] = useState(false)
  const [result, setResult] = useState<CopyResult | null>(null)
  const [error, setError] = useState('')

  // Copying into the branch you are standing in is a no-op the API rejects.
  const targets = useMemo(
    () => branches.filter((b) => b.id !== currentBranchId),
    [branches, currentBranchId]
  )

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setSearch('')
    setResult(null)
    setError('')
    setTargetBranchId(targets.length === 1 ? targets[0].id : '')
  }, [open, targets])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.manufacturer?.name ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  if (!open) return null

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id))

  const toggleAllVisible = () => {
    const next = new Set(selected)
    if (allVisibleSelected) visible.forEach((i) => next.delete(i.id))
    else visible.forEach((i) => next.add(i.id))
    setSelected(next)
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleCopy = async () => {
    if (!targetBranchId || selected.size === 0 || isCopying) return
    setIsCopying(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/items/copy-to-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBranchId, itemIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Copy failed')
      setResult(data)
      setSelected(new Set())
      onCopied?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed')
    } finally {
      setIsCopying(false)
    }
  }

  const targetName = targets.find((b) => b.id === targetBranchId)?.name

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">Copy items to another branch</p>
            <p className="text-xs text-gray-500">
              Copies the product and its prices. Stock always starts at zero.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>

        {targets.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">
            There is no other branch to copy into yet.
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-gray-100 space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase">
                Copy into
              </label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              >
                <option value="">Choose a branch…</option>
                {targets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full px-3 py-2 border border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  {allVisibleSelected ? 'Clear' : 'Select'} all {visible.length} shown
                </button>
                <span className="text-gray-500">{selected.size} selected</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2">
              {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No items match.</p>
              ) : (
                visible.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 py-2 border-b border-gray-50 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="w-4 h-4 shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {item.name}
                      </span>
                      {item.manufacturer?.name && (
                        <span className="block text-xs text-gray-400">{item.manufacturer.name}</span>
                      )}
                    </span>
                    <span className="text-sm text-gray-600 shrink-0">
                      {formatCurrency(item.sellingPrice)}
                    </span>
                  </label>
                ))
              )}
            </div>

            {(result || error) && (
              <div className="px-5 py-3 border-t border-gray-100">
                {error && (
                  <p className="text-sm text-red-700 bg-red-50 px-3 py-2">{error}</p>
                )}
                {result && (
                  <div
                    className={`px-3 py-2 text-sm ${result.skipped === 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}
                  >
                    <p className="font-semibold">
                      {result.copied} copied to {result.targetBranchName}
                      {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
                    </p>
                    {result.errors.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs max-h-24 overflow-y-auto">
                        {result.errors.map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 px-5 py-3 border-t border-gray-200">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={handleCopy}
                disabled={!targetBranchId || selected.size === 0 || isCopying}
                className="flex-[2] py-2.5 bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCopying
                  ? 'Copying…'
                  : `Copy ${selected.size || ''} item${selected.size === 1 ? '' : 's'}${targetName ? ` to ${targetName}` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
