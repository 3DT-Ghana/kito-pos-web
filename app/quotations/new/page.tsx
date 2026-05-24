'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useItems } from '@/hooks/useItems'
import { useCustomers } from '@/hooks/useCustomers'
import { formatCurrency } from '@/lib/utils/format'

interface CartItem {
  itemId: string
  name: string
  manufacturer: string
  quantity: number
  price: number
  maxStock: number
}

export default function NewQuotationPage() {
  const router = useRouter()
  const { items } = useItems()
  const { customers } = useCustomers()

  const [cart, setCart] = useState<CartItem[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const itemSearchRef = useRef<HTMLDivElement>(null)

  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerSearchRef = useRef<HTMLDivElement>(null)

  const [note, setNote] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node)) setShowItemDropdown(false)
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) setShowCustomerDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredItems = itemSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase()) || (i.manufacturer?.name || '').toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 10)
    : items.slice(0, 10)

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch)).slice(0, 8)
    : customers.slice(0, 8)

  const addToCart = (item: (typeof items)[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id)
      if (existing) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { itemId: item.id, name: item.name, manufacturer: item.manufacturer?.name || '', quantity: 1, price: item.sellingPrice, maxStock: item.quantity }]
    })
    setItemSearch('')
    setShowItemDropdown(false)
  }

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.itemId !== itemId)); return }
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c))
  }

  const updatePrice = (itemId: string, price: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, price: Math.max(0, price) } : c))
  }

  const totalAmount = cart.reduce((s, c) => s + c.price * c.quantity, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (cart.length === 0) { setFormError('Add at least one item'); return }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer?.id || null,
          note: note || null,
          validUntil: validUntil || null,
          items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, price: c.price })),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create quotation')
      }
      const created = await res.json()
      router.push(`/quotations/${created.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create quotation')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Quotation</h1>
            <p className="text-sm text-gray-500">Create a proforma invoice for a customer</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Customer */}
          <div ref={customerSearchRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Customer <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {selectedCustomer ? (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-2 border-blue-200">
                <div className="w-9 h-9 bg-blue-600 flex items-center justify-center text-white font-bold shrink-0 text-sm">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <p className="flex-1 font-bold text-gray-900 text-sm">{selectedCustomer.name}</p>
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                    {filteredCustomers.map(c => (
                      <button key={c.id} type="button" onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setShowCustomerDropdown(false) }}
                        className="w-full px-4 py-2.5 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                        <div className="w-8 h-8 bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">{c.name}</span>
                      </button>
                    ))}
                  </div>
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
              <input
                type="text"
                placeholder="Search items..."
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true) }}
                onFocus={() => setShowItemDropdown(true)}
                className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            {showItemDropdown && filteredItems.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {filteredItems.map(item => (
                  <button key={item.id} type="button" onClick={() => addToCart(item)}
                    className="w-full px-4 py-2.5 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-blue-600">{item.manufacturer?.name || 'Unknown'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800 text-sm">{formatCurrency(item.sellingPrice)}</p>
                      <p className="text-xs text-gray-400">{item.quantity} in stock</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div className="bg-white border-2 border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase">Quote Items — {cart.length}</span>
                <button type="button" onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear all</button>
              </div>
              <div className="divide-y divide-gray-100">
                {cart.map(item => (
                  <div key={item.itemId} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-blue-600">{item.manufacturer}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => updateQty(item.itemId, item.quantity - 1)} className="w-7 h-7 border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold">−</button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateQty(item.itemId, parseFloat(e.target.value) || 0)}
                        min={1}
                        className="w-14 text-center text-sm font-bold border-2 border-gray-200 py-1 focus:border-blue-500 focus:outline-none"
                      />
                      <button type="button" onClick={() => updateQty(item.itemId, item.quantity + 1)} className="w-7 h-7 border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold">+</button>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-gray-400">@</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={e => updatePrice(item.itemId, parseFloat(e.target.value) || 0)}
                        step="0.01"
                        min="0"
                        className="w-24 px-2 py-1 border-2 border-gray-200 text-sm font-bold text-right focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <p className="text-sm font-bold text-gray-900 w-24 text-right shrink-0">{formatCurrency(item.price * item.quantity)}</p>
                    <button type="button" onClick={() => setCart(prev => prev.filter(c => c.itemId !== item.itemId))} className="text-red-300 hover:text-red-500 text-lg leading-none shrink-0">×</button>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">{cart.length} item(s)</span>
                <span className="text-base font-bold text-gray-900">Total: {formatCurrency(totalAmount)}</span>
              </div>
            </div>
          )}

          {/* Note + Valid Until */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Valid Until</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Note <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Prices valid for 7 days"
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
              ⚠ {formError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || cart.length === 0}
              className="flex-1 py-4 bg-blue-600 text-white text-base font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md"
            >
              {isSubmitting ? 'Creating...' : `📄 Create Quotation — ${formatCurrency(totalAmount)}`}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={isSubmitting}
              className="sm:w-32 py-4 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
