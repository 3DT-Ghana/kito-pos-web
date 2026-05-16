'use client'

import { useState, useRef, useEffect } from 'react'
import { useItems } from '@/hooks/useItems'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils/format'
import { isInventoryItemType, itemTypeLabel, normalizeItemType } from '@/lib/items/type'

interface CartItem {
  itemId: string
  name: string
  manufacturer: string
  itemType: 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'
  quantity: number
  costPrice: number
  unitName?: string
  piecesPerUnit?: number
  cartonsInput?: number
  piecesInput?: number
}

interface PurchaseFormData {
  supplierId: string
  paidAmount?: number
  items: { itemId: string; quantity: number; costPrice: number }[]
}

interface PurchaseFormProps {
  onSubmit: (data: PurchaseFormData) => Promise<void>
  onCancel?: () => void
}

// Reusable stepper
function Stepper({
  value,
  onDecrement,
  onIncrement,
  onChange,
  min,
  max,
  step = 1,
  color = 'gray',
}: {
  value: number
  onDecrement: () => void
  onIncrement: () => void
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  color?: 'gray' | 'amber' | 'green'
}) {
  const borderCls = color === 'amber' ? 'border-amber-300' : color === 'green' ? 'border-green-300' : 'border-gray-200'
  const hoverCls = color === 'amber' ? 'hover:bg-amber-50' : color === 'green' ? 'hover:bg-green-50' : 'hover:bg-gray-100'
  return (
    <div className={`flex items-center border-2 ${borderCls} rounded-lg overflow-hidden bg-white shrink-0`}>
      <button type="button" onClick={onDecrement} disabled={min !== undefined && value <= min}
        className={`px-2 md:px-3 py-1.5 md:py-2 text-gray-600 ${hoverCls} font-bold text-sm disabled:opacity-30 transition-colors`}>−</button>
      <input type="number" value={value}
        onChange={e => onChange(step < 1 ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
        min={min} max={max} step={step}
        className="flex-1 min-w-0 w-10 md:w-16 text-center text-sm font-bold text-gray-900 focus:outline-none py-1.5 md:py-2 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" onClick={onIncrement} disabled={max !== undefined && value >= max}
        className={`px-2 md:px-3 py-1.5 md:py-2 text-gray-600 ${hoverCls} font-bold text-sm disabled:opacity-30 transition-colors`}>+</button>
    </div>
  )
}

export function PurchaseForm({ onSubmit, onCancel }: PurchaseFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const { user } = useUser()
  const [useUnitSystem, setUseUnitSystem] = useState(false)
  useEffect(() => {
    if (!user?.tenantId) return
    fetch(`/api/tenants/${user.tenantId}`)
      .then(r => r.json())
      .then(data => { if (data?.useUnitSystem) setUseUnitSystem(true) })
      .catch(() => {})
  }, [user?.tenantId])

  const [purchaseType, setPurchaseType] = useState<'CASH' | 'CREDIT'>('CASH')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierSearchRef = useRef<HTMLDivElement>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const itemSearchRef = useRef<HTMLDivElement>(null)
  const [depositPaid, setDepositPaid] = useState('')

  const { items } = useItems()
  const { suppliers } = useSuppliers()

  // ── Draft persistence ─────────────────────────────────────────────────────
  const draftKey = user?.tenantId ? `purchase_draft_${user.tenantId}` : null
  const [hasDraft, setHasDraft] = useState(false)

  useEffect(() => {
    if (!draftKey) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) setHasDraft(true)
    } catch {}
  }, [draftKey])

  useEffect(() => {
    if (!draftKey) return
    if (cart.length === 0 && !selectedSupplier && !depositPaid) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        cart,
        selectedSupplier,
        purchaseType,
        depositPaid,
      }))
    } catch {}
  }, [draftKey, cart, selectedSupplier, purchaseType, depositPaid])

  const restoreDraft = () => {
    if (!draftKey) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.cart) setCart(d.cart)
      if (d.selectedSupplier) setSelectedSupplier(d.selectedSupplier)
      if (d.purchaseType) setPurchaseType(d.purchaseType)
      if (d.depositPaid !== undefined) setDepositPaid(d.depositPaid)
    } catch {}
    setHasDraft(false)
  }

  const discardDraft = () => {
    if (!draftKey) return
    try { localStorage.removeItem(draftKey) } catch {}
    setHasDraft(false)
  }

  const clearDraft = () => {
    if (!draftKey) return
    try { localStorage.removeItem(draftKey) } catch {}
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node)) setShowItemDropdown(false)
      if (supplierSearchRef.current && !supplierSearchRef.current.contains(e.target as Node)) setShowSupplierDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredItems = itemSearch.trim()
    ? items.filter(i =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (i.manufacturer?.name || '').toLowerCase().includes(itemSearch.toLowerCase())
      ).slice(0, 10)
    : items.slice(0, 10)

  const filteredSuppliers = supplierSearch.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).slice(0, 8)
    : suppliers.slice(0, 8)

  const addToCart = (item: typeof items[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id)
      if (existing) {
        if (useUnitSystem && (item.piecesPerUnit ?? 1) > 1) {
          const newCartons = (existing.cartonsInput ?? 0) + 1
          return prev.map(c =>
            c.itemId === item.id
              ? { ...c, cartonsInput: newCartons, quantity: newCartons + (existing.piecesInput ?? 0) / (item.piecesPerUnit ?? 1) }
              : c
          )
        }
        return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        manufacturer: item.manufacturer?.name || 'Unknown',
        itemType: normalizeItemType(item.itemType),
        quantity: 1,
        costPrice: item.costPrice,
        unitName: item.unitName,
        piecesPerUnit: item.piecesPerUnit,
        cartonsInput: 1,
        piecesInput: 0,
      }]
    })
    setItemSearch('')
    setShowItemDropdown(false)
  }

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) { removeFromCart(itemId); return }
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c))
  }

  const updateCartons = (itemId: string, cartons: number) => {
    setCart(prev => prev.map(c => {
      if (c.itemId !== itemId) return c
      const ppu = c.piecesPerUnit ?? 1
      const qty = Math.max(0, cartons) + (c.piecesInput ?? 0) / ppu
      return { ...c, cartonsInput: Math.max(0, cartons), quantity: qty }
    }))
  }

  const updatePieces = (itemId: string, pieces: number) => {
    setCart(prev => prev.map(c => {
      if (c.itemId !== itemId) return c
      const ppu = c.piecesPerUnit ?? 1
      const clampedPieces = Math.min(Math.max(0, pieces), ppu - 1)
      const qty = (c.cartonsInput ?? 0) + clampedPieces / ppu
      return { ...c, piecesInput: clampedPieces, quantity: qty }
    }))
  }

  const updateCostPrice = (itemId: string, price: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, costPrice: Math.max(0, price) } : c))
  }

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(c => c.itemId !== itemId))
  }

  const totalAmount = cart.reduce((sum, c) => sum + c.costPrice * c.quantity, 0)
  const depositNum = parseFloat(depositPaid) || 0
  const owedToSupplier = totalAmount - depositNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!selectedSupplier) { setFormError('Please select a supplier'); return }
    if (cart.length === 0) { setFormError('Add at least one item to the order'); return }
    const data: PurchaseFormData = {
      supplierId: selectedSupplier.id,
      items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, costPrice: c.costPrice })),
    }
    if (purchaseType === 'CASH') {
      data.paidAmount = totalAmount
    } else {
      data.paidAmount = depositNum >= 0 && depositNum <= totalAmount ? depositNum : 0
    }
    setIsSubmitting(true)
    try {
      await onSubmit(data)
      clearDraft()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record purchase')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Draft restore banner */}
      {hasDraft && (
        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
          <span className="text-xl shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">You have an unsaved purchase draft</p>
            <p className="text-xs text-amber-700">Continue where you left off?</p>
          </div>
          <button type="button" onClick={restoreDraft}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shrink-0 transition-colors">
            Restore
          </button>
          <button type="button" onClick={discardDraft}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 text-xs font-semibold rounded-lg shrink-0 transition-colors">
            Discard
          </button>
        </div>
      )}

      {/* Purchase Type Toggle */}
      <div className="grid grid-cols-2 gap-3">
        {(['CASH', 'CREDIT'] as const).map(type => {
          const active = purchaseType === type
          const isCash = type === 'CASH'
          return (
            <button key={type} type="button" onClick={() => setPurchaseType(type)}
              className={`py-3.5 rounded-xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-2.5 ${
                active
                  ? isCash
                    ? 'bg-green-600 text-white border-green-600 shadow-md'
                    : 'bg-amber-500 text-white border-amber-500 shadow-md'
                  : isCash
                    ? 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:bg-green-50'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:bg-amber-50'
              }`}>
              <span className="text-xl">{isCash ? '💵' : '📦'}</span>
              <div className="text-left">
                <p className="font-bold">{isCash ? 'Cash Purchase' : 'Purchase Order'}</p>
                <p className={`text-xs font-normal ${active ? 'opacity-80' : 'text-gray-400'}`}>
                  {isCash ? 'Pay in full now' : 'Pay later / credit'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Supplier Search */}
      <div ref={supplierSearchRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Supplier <span className="text-red-500">*</span>
        </label>
        {selectedSupplier ? (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold shrink-0 text-sm">
              {selectedSupplier.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{selectedSupplier.name}</p>
              {selectedSupplier.balance > 0 && (
                <p className="text-xs text-amber-600">You owe: {formatCurrency(selectedSupplier.balance)}</p>
              )}
            </div>
            <button type="button" onClick={() => { setSelectedSupplier(null); setSupplierSearch('') }}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none shrink-0">×</button>
          </div>
        ) : (
          <>
            <input type="text" placeholder="Search supplier by name..."
              value={supplierSearch}
              onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true) }}
              onFocus={() => setShowSupplierDropdown(true)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-sm"
            />
            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden">
                {filteredSuppliers.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSelectedSupplier(s); setSupplierSearch(''); setShowSupplierDropdown(false) }}
                    className="w-full px-4 py-2.5 text-left hover:bg-green-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${s.balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                      {s.balance > 0 && <p className="text-xs text-amber-600">Owe {formatCurrency(s.balance)}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showSupplierDropdown && supplierSearch.trim() && filteredSuppliers.length === 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4 text-center text-sm text-gray-500">No suppliers found</div>
            )}
          </>
        )}
      </div>

      {/* Item Search */}
      <div ref={itemSearchRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Add Items <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search items by name or manufacturer..."
            value={itemSearch}
            onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true) }}
            onFocus={() => setShowItemDropdown(true)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-sm"
          />
        </div>
        {showItemDropdown && filteredItems.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.itemId === item.id)
              const stockTracked = isInventoryItemType(item.itemType)
              return (
                <button key={item.id} type="button" onClick={() => addToCart(item)}
                  className="w-full px-4 py-2.5 text-left border-b border-gray-100 last:border-0 flex items-center gap-3 hover:bg-green-50 cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-blue-600 font-medium">{item.manufacturer?.name || 'Unknown'}</p>
                      {!stockTracked && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {itemTypeLabel(item.itemType)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-800 text-sm">{formatCurrency(item.costPrice)}</p>
                    <p className="text-xs text-gray-500">
                      {stockTracked
                        ? (useUnitSystem && item.unitName ? `Stock: ${item.quantity} ${item.unitName}` : `Stock: ${item.quantity}`)
                        : 'No stock tracking'}
                    </p>
                  </div>
                  {inCart && (
                    <span className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {inCart.quantity}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {showItemDropdown && itemSearch.trim() && filteredItems.length === 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-xl p-4 text-center text-sm text-gray-500">
            No items found matching &ldquo;{itemSearch}&rdquo;
          </div>
        )}
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Order — {cart.length} item{cart.length !== 1 ? 's' : ''}
            </span>
            <button type="button" onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-semibold">
              Clear all
            </button>
          </div>

          {/* Desktop table */}
          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left pl-4 pr-2 py-2 font-semibold">Item</th>
                <th className="text-center px-2 py-2 font-semibold">Quantity</th>
                <th className="text-right px-2 py-2 font-semibold">Cost Price</th>
                <th className="text-right pl-2 pr-4 py-2 font-semibold w-24">Subtotal</th>
                <th className="w-8 pr-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cart.map(item => {
                const stockTracked = isInventoryItemType(item.itemType)
                const isCartonMode = useUnitSystem && (item.piecesPerUnit ?? 1) > 1
                const isWeightMode = useUnitSystem && !!item.unitName && (item.piecesPerUnit ?? 1) <= 1
                return (
                  <tr key={item.itemId} className="group hover:bg-gray-50/50">
                    {/* Item name */}
                    <td className="pl-4 pr-2 py-3 align-top">
                      <p className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{item.name}</p>
                      <p className="text-xs text-blue-500">{item.manufacturer}</p>
                      {isCartonMode && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {stockTracked
                            ? `= ${Math.round(item.quantity * (item.piecesPerUnit ?? 1))} pcs · stock ${items.find(i => i.id === item.itemId)?.quantity ?? '—'} ${item.unitName ?? 'ctn'}`
                            : 'No stock tracking'}
                        </p>
                      )}
                    </td>
                    {/* Quantity */}
                    <td className="px-2 py-3 align-middle">
                      <div className="flex flex-col items-center gap-1.5">
                        {isCartonMode ? (
                          <div className="flex items-center gap-1.5">
                            <Stepper value={item.cartonsInput ?? 0} min={0}
                              onDecrement={() => updateCartons(item.itemId, (item.cartonsInput ?? 0) - 1)}
                              onIncrement={() => updateCartons(item.itemId, (item.cartonsInput ?? 0) + 1)}
                              onChange={v => updateCartons(item.itemId, v)} color="amber" />
                            <span className="text-xs font-semibold text-amber-700">{item.unitName ?? 'ctn'}</span>
                            <span className="text-gray-300">+</span>
                            <Stepper value={item.piecesInput ?? 0} min={0} max={(item.piecesPerUnit ?? 1) - 1}
                              onDecrement={() => updatePieces(item.itemId, (item.piecesInput ?? 0) - 1)}
                              onIncrement={() => updatePieces(item.itemId, (item.piecesInput ?? 0) + 1)}
                              onChange={v => updatePieces(item.itemId, v)} />
                            <span className="text-xs font-semibold text-gray-500">pcs</span>
                          </div>
                        ) : isWeightMode ? (
                          <div className="flex items-center gap-1.5">
                            <Stepper value={item.quantity} min={0} step={0.5}
                              onDecrement={() => updateQty(item.itemId, Math.max(0, parseFloat((item.quantity - 0.5).toFixed(3))))}
                              onIncrement={() => updateQty(item.itemId, parseFloat((item.quantity + 0.5).toFixed(3)))}
                              onChange={v => updateQty(item.itemId, v)} color="green" />
                            <span className="text-sm font-semibold text-green-700">{item.unitName}</span>
                          </div>
                        ) : (
                          <Stepper value={item.quantity} min={1}
                            onDecrement={() => updateQty(item.itemId, item.quantity - 1)}
                            onIncrement={() => updateQty(item.itemId, item.quantity + 1)}
                            onChange={v => updateQty(item.itemId, v)} />
                        )}
                      </div>
                    </td>
                    {/* Cost Price */}
                    <td className="px-2 py-3 align-middle">
                      <div className="flex justify-end">
                        <input type="number" value={item.costPrice}
                          onChange={e => updateCostPrice(item.itemId, parseFloat(e.target.value) || 0)}
                          step="0.01" min="0"
                          className="w-28 px-2.5 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-green-500 focus:outline-none text-right" />
                      </div>
                    </td>
                    {/* Subtotal */}
                    <td className="pl-2 pr-4 py-3 align-middle text-right">
                      <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{formatCurrency(item.costPrice * item.quantity)}</p>
                    </td>
                    {/* Remove */}
                    <td className="pr-3 py-3 align-middle">
                      <button type="button" onClick={() => removeFromCart(item.itemId)}
                        className="text-red-300 hover:text-red-500 text-lg leading-none transition-colors">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-gray-100">
            {cart.map(item => {
              const stockTracked = isInventoryItemType(item.itemType)
              const isCartonMode = useUnitSystem && (item.piecesPerUnit ?? 1) > 1
              const isWeightMode = useUnitSystem && !!item.unitName && (item.piecesPerUnit ?? 1) <= 1
              return (
                <div key={item.itemId} className="p-3 space-y-2.5">
                  {/* Row 1: name + total + remove */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-blue-600">{item.manufacturer}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0">{formatCurrency(item.costPrice * item.quantity)}</span>
                    <button type="button" onClick={() => removeFromCart(item.itemId)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0 -mt-0.5">×</button>
                  </div>

                  {/* Qty + Price */}
                  {isCartonMode ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">{item.unitName ?? 'Cartons'}</label>
                          <Stepper value={item.cartonsInput ?? 0} min={0}
                            onDecrement={() => updateCartons(item.itemId, (item.cartonsInput ?? 0) - 1)}
                            onIncrement={() => updateCartons(item.itemId, (item.cartonsInput ?? 0) + 1)}
                            onChange={v => updateCartons(item.itemId, v)} color="amber" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">Extra pcs</label>
                          <Stepper value={item.piecesInput ?? 0} min={0} max={(item.piecesPerUnit ?? 1) - 1}
                            onDecrement={() => updatePieces(item.itemId, (item.piecesInput ?? 0) - 1)}
                            onIncrement={() => updatePieces(item.itemId, (item.piecesInput ?? 0) + 1)}
                            onChange={v => updatePieces(item.itemId, v)} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                          {stockTracked
                            ? `= ${Math.round(item.quantity * (item.piecesPerUnit ?? 1))} pcs · stock ${items.find(i => i.id === item.itemId)?.quantity ?? '—'}`
                            : 'No stock tracking'}
                        </p>
                        <div className="flex items-center gap-1">
                          <input type="number" value={item.costPrice} onChange={e => updateCostPrice(item.itemId, parseFloat(e.target.value) || 0)}
                            step="0.01" min="0" className="w-20 px-2 py-1 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-green-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-xs text-gray-400">/{item.unitName ?? 'ctn'}</span>
                        </div>
                      </div>
                    </div>
                  ) : isWeightMode ? (
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-400 mb-0.5">Qty ({item.unitName})</label>
                        <Stepper value={item.quantity} min={0} step={0.5}
                          onDecrement={() => updateQty(item.itemId, Math.max(0, parseFloat((item.quantity - 0.5).toFixed(3))))}
                          onIncrement={() => updateQty(item.itemId, parseFloat((item.quantity + 0.5).toFixed(3)))}
                          onChange={v => updateQty(item.itemId, v)} color="green" />
                      </div>
                      <div className="flex flex-col items-end">
                        <label className="text-[10px] text-gray-400 mb-0.5">Price/{item.unitName}</label>
                        <input type="number" value={item.costPrice} onChange={e => updateCostPrice(item.itemId, parseFloat(e.target.value) || 0)}
                          step="0.01" min="0" className="w-20 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-green-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Stepper value={item.quantity} min={1}
                        onDecrement={() => updateQty(item.itemId, item.quantity - 1)}
                        onIncrement={() => updateQty(item.itemId, item.quantity + 1)}
                        onChange={v => updateQty(item.itemId, v)} />
                      <input type="number" value={item.costPrice} onChange={e => updateCostPrice(item.itemId, parseFloat(e.target.value) || 0)}
                        step="0.01" min="0" className="w-20 px-2 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white focus:border-green-500 focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer total */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500 font-medium">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
            <span className="text-base font-bold text-gray-800">Subtotal: {formatCurrency(totalAmount)}</span>
          </div>
        </div>
      )}

      {/* Payment Section */}
      {cart.length > 0 && (
        <div className={`rounded-2xl border-2 p-5 space-y-4 ${purchaseType === 'CASH' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex justify-between items-center border-b border-gray-200 pb-3">
            <span className="text-base font-bold text-gray-700">Total</span>
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
          </div>

          {purchaseType === 'CASH' ? (
            <div className="flex items-center gap-3 bg-green-100 rounded-xl p-3">
              <span className="text-green-700 text-xl">✓</span>
              <div>
                <p className="text-sm font-bold text-green-800">Paying in full — {formatCurrency(totalAmount)}</p>
                <p className="text-xs text-green-700">No balance added to supplier</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Deposit / Part Payment (GH₵) <span className="text-gray-400 font-normal">optional</span>
                </label>
                <input type="number" value={depositPaid} onChange={e => setDepositPaid(e.target.value)}
                  step="0.01" min="0" max={totalAmount} placeholder="0.00"
                  className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:border-amber-500 focus:outline-none text-xl font-bold bg-white" />
              </div>
              <div className="flex justify-between items-center bg-amber-100 rounded-xl p-3">
                <span className="text-sm font-semibold text-amber-800">Owed to supplier:</span>
                <span className="text-xl font-bold text-amber-700">{formatCurrency(Math.max(0, owedToSupplier))}</span>
              </div>
              {selectedSupplier && selectedSupplier.balance > 0 && (
                <p className="text-xs text-amber-700 bg-amber-100 px-3 py-2 rounded-lg font-medium">
                  ℹ You already owe this supplier {formatCurrency(selectedSupplier.balance)}. Total after this order: {formatCurrency(selectedSupplier.balance + Math.max(0, owedToSupplier))}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          ⚠ {formError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button type="submit" disabled={isSubmitting || cart.length === 0 || !selectedSupplier}
          className={`flex-1 py-4 text-white text-base font-bold rounded-xl disabled:opacity-50 transition-all shadow-md ${
            purchaseType === 'CASH' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'
          }`}>
          {isSubmitting
            ? 'Recording...'
            : purchaseType === 'CASH'
              ? `💵 Record Cash Purchase — ${formatCurrency(totalAmount)}`
              : `📦 Place Purchase Order — ${formatCurrency(totalAmount)}`}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isSubmitting}
            className="sm:w-32 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
