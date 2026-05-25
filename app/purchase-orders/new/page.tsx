'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'

interface Supplier { id: string; name: string; phone?: string }
interface Item { id: string; name: string; sellingPrice: number; costPrice: number; manufacturer?: { name: string } | null }
interface CartItem { itemId: string; itemName: string; quantity: number; costPrice: number }

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierSearch, setSupplierSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [showSupplierDrop, setShowSupplierDrop] = useState(false)
  const supplierRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<Item[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDrop, setShowItemDrop] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [note, setNote] = useState('')
  const [expectedAt, setExpectedAt] = useState('')

  useEffect(() => {
    fetch('/api/suppliers').then(r => r.json()).then(d => setSuppliers(Array.isArray(d) ? d : d.suppliers || d.data || [])).catch(() => {})
    fetch('/api/items').then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : d.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setShowSupplierDrop(false)
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) setShowItemDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredSuppliers = supplierSearch.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.phone || '').includes(supplierSearch)).slice(0, 8)
    : suppliers.slice(0, 8)

  const filteredItems = itemSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()) || (i.manufacturer?.name || '').toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 10)
    : items.slice(0, 10)

  const addToCart = (item: Item) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id)
      if (existing) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { itemId: item.id, itemName: item.name, quantity: 1, costPrice: item.costPrice }]
    })
    setItemSearch('')
    setShowItemDrop(false)
  }

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.itemId !== itemId)); return }
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c))
  }

  const updateCost = (itemId: string, cost: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, costPrice: Math.max(0, cost) } : c))
  }

  const total = cart.reduce((s, c) => s + c.quantity * c.costPrice, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (cart.length === 0) { setFormError('Add at least one item'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplier?.id || null,
          note: note || null,
          expectedAt: expectedAt || null,
          items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, costPrice: c.costPrice })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create purchase order')
      }
      const data = await res.json()
      router.push(`/purchase-orders/${data.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create purchase order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/purchase-orders')} className="p-2 hover:bg-gray-100">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
            <p className="text-sm text-gray-500">Create a purchase order to send to a supplier</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Supplier */}
          <div className="bg-white border border-gray-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Supplier</h2>
            <div ref={supplierRef} className="relative">
              {selectedSupplier ? (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 border-2 border-green-200">
                  <div className="w-9 h-9 bg-green-600 flex items-center justify-center text-white font-bold shrink-0 text-sm">
                    {selectedSupplier.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{selectedSupplier.name}</p>
                    {selectedSupplier.phone && <p className="text-xs text-gray-500">{selectedSupplier.phone}</p>}
                  </div>
                  <button type="button" onClick={() => { setSelectedSupplier(null); setSupplierSearch('') }} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search supplier (optional)..."
                    value={supplierSearch}
                    onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDrop(true) }}
                    onFocus={() => setShowSupplierDrop(true)}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm"
                  />
                  {showSupplierDrop && filteredSuppliers.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                      {filteredSuppliers.map(s => (
                        <button key={s.id} type="button" onClick={() => { setSelectedSupplier(s); setSupplierSearch(''); setShowSupplierDrop(false) }}
                          className="w-full px-4 py-2.5 text-left hover:bg-green-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                          <div className="w-8 h-8 bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                            {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-gray-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Items to Order</h2>

            {/* Item search */}
            <div ref={itemRef} className="relative">
              <input
                type="text"
                placeholder="Search items to add..."
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); setShowItemDrop(true) }}
                onFocus={() => setShowItemDrop(true)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm"
              />
              {showItemDrop && filteredItems.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                  {filteredItems.map(item => {
                    const inCart = cart.find(c => c.itemId === item.id)
                    return (
                      <button key={item.id} type="button" onClick={() => addToCart(item)}
                        className="w-full px-4 py-2.5 text-left hover:bg-green-50 flex items-center gap-3 border-b border-gray-100 last:border-0 cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.manufacturer?.name || ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Cost: {formatCurrency(item.costPrice)}</p>
                        </div>
                        {inCart && (
                          <span className="w-5 h-5 bg-green-600 -full flex items-center justify-center text-white text-xs font-bold shrink-0">{inCart.quantity}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div className="border border-gray-200 overflow-hidden">
                {/* Desktop table */}
                <table className="hidden sm:table w-full">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="px-4 py-2 text-center">Qty</th>
                      <th className="px-4 py-2 text-right">Cost Price</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cart.map(item => (
                      <tr key={item.itemId}>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.itemName}</td>
                        <td className="px-4 py-3">
                          <input type="number" value={item.quantity} onChange={e => updateQty(item.itemId, parseInt(e.target.value) || 0)} min="1"
                            className="w-16 text-center px-2 py-1 border-2 border-gray-200 text-sm font-bold focus:border-green-500 focus:outline-none" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" value={item.costPrice} onChange={e => updateCost(item.itemId, parseFloat(e.target.value) || 0)} min="0" step="0.01"
                            className="w-24 text-right px-2 py-1 border-2 border-gray-200 text-sm font-bold focus:border-green-500 focus:outline-none" />
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(item.quantity * item.costPrice)}</td>
                        <td className="px-2 py-3">
                          <button type="button" onClick={() => setCart(prev => prev.filter(c => c.itemId !== item.itemId))} className="text-red-300 hover:text-red-500 text-lg">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-700">Total Order Value</td>
                      <td className="px-4 py-3 text-right text-base font-bold text-green-700">{formatCurrency(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {cart.map(item => (
                    <div key={item.itemId} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900 text-sm flex-1 truncate">{item.itemName}</p>
                        <button type="button" onClick={() => setCart(prev => prev.filter(c => c.itemId !== item.itemId))} className="text-red-400 text-lg ml-2">×</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 block">Quantity</label>
                          <input type="number" value={item.quantity} onChange={e => updateQty(item.itemId, parseInt(e.target.value) || 0)} min="1"
                            className="w-full px-2 py-1 border-2 border-gray-200 text-sm font-bold focus:border-green-500 focus:outline-none text-center" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block">Cost Price (GH₵)</label>
                          <input type="number" value={item.costPrice} onChange={e => updateCost(item.itemId, parseFloat(e.target.value) || 0)} min="0" step="0.01"
                            className="w-full px-2 py-1 border-2 border-gray-200 text-sm font-bold focus:border-green-500 focus:outline-none text-right" />
                        </div>
                      </div>
                      <p className="text-right text-sm font-bold text-gray-900">{formatCurrency(item.quantity * item.costPrice)}</p>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 bg-gray-50 flex justify-between">
                    <span className="text-sm font-bold text-gray-700">Total</span>
                    <span className="text-sm font-bold text-green-700">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="bg-white border border-gray-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Urgent order"
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent" />
              </div>
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
              {formError}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => router.push('/purchase-orders')}
              className="flex-1 sm:flex-none px-6 py-3 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || cart.length === 0}
              className="flex-1 py-3 bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 shadow-md">
              {isSubmitting ? 'Creating...' : `Create Purchase Order — ${formatCurrency(total)}`}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
