'use client'

import { useState, useRef, useEffect, use } from 'react'
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

export default function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH')
  const [cart, setCart] = useState<CartItem[]>([])
  const [amountPaid, setAmountPaid] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)

  const customerSearchRef = useRef<HTMLDivElement>(null)
  const itemSearchRef = useRef<HTMLDivElement>(null)

  const { items } = useItems()
  const { customers } = useCustomers()

  // Load existing sale
  useEffect(() => {
    fetch(`/api/sales/${id}`)
      .then(r => r.json())
      .then(sale => {
        if (sale.error) { setLoadError(sale.error); return }
        setPaymentType(sale.paymentType)
        setAmountPaid(String(sale.paidAmount))
        if (sale.customer) {
          setSelectedCustomer({ id: sale.customer.id, name: sale.customer.name, balance: sale.customer.balance })
        }
        setCart(sale.items.map((si: { itemId: string; quantity: number; price: number; item: { name: string; quantity: number; manufacturer?: { name: string } } }) => ({
          itemId: si.itemId,
          name: si.item.name,
          manufacturer: si.item.manufacturer?.name || 'Unknown',
          quantity: si.quantity,
          price: si.price,
          maxStock: si.item.quantity + si.quantity, // restore qty + current for max
        })))
      })
      .catch(() => setLoadError('Failed to load sale'))
      .finally(() => setLoading(false))
  }, [id])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node)) setShowItemDropdown(false)
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) setShowCustomerDropdown(false)
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

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone || '').includes(customerSearch)
      ).slice(0, 8)
    : customers.slice(0, 8)

  const addToCart = (item: typeof items[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id)
      if (existing) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        itemId: item.id,
        name: item.name,
        manufacturer: item.manufacturer?.name || 'Unknown',
        quantity: 1,
        price: item.sellingPrice,
        maxStock: item.quantity,
      }]
    })
    setItemSearch('')
    setShowItemDropdown(false)
  }

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(c => c.itemId !== itemId))
    else setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c))
  }

  const updatePrice = (itemId: string, price: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, price: Math.max(0, price) } : c))
  }

  const totalAmount = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const paidNum = parseFloat(amountPaid) || 0
  const change = paidNum - totalAmount
  const creditAmount = totalAmount - paidNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (cart.length === 0) { setFormError('Add at least one item'); return }
    if (paymentType === 'CREDIT' && !selectedCustomer) { setFormError('Credit sales require a customer'); return }

    const paid = paymentType === 'CASH' ? totalAmount : (paidNum >= 0 && paidNum <= totalAmount ? paidNum : 0)

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer?.id || null,
          paymentType,
          paidAmount: paid,
          items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, price: c.price })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      router.push(`/sales/${id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent -full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-red-600 font-semibold">{loadError}</p>
          <button onClick={() => router.back()} className="mt-4 text-blue-600 underline text-sm">Go back</button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/sales/${id}`)} className="p-2 hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Sale</h1>
            <p className="text-sm text-gray-500 font-mono">{id}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Payment Type Toggle */}
          <div className="grid grid-cols-2 gap-3">
            {(['CASH', 'CREDIT'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setPaymentType(type)}
                className={`py-4 font-bold text-base transition-all border-2 flex flex-col items-center gap-1 ${
                  paymentType === type
                    ? type === 'CASH' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-orange-500 text-white border-orange-500 shadow-lg'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{type === 'CASH' ? '💵' : '📋'}</span>
                <span>{type === 'CASH' ? 'Cash Sale' : 'Credit Sale'}</span>
              </button>
            ))}
          </div>

          {/* Customer */}
          <div ref={customerSearchRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Customer {paymentType === 'CREDIT' && <span className="text-red-500">*</span>}
              {paymentType === 'CASH' && <span className="text-gray-400 font-normal"> (optional)</span>}
            </label>
            {selectedCustomer ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-200">
                <div className="w-9 h-9 bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{selectedCustomer.name}</p>
                  {selectedCustomer.balance > 0 && (
                    <p className="text-xs text-red-600">Outstanding: {formatCurrency(selectedCustomer.balance)}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0">×</button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                    {filteredCustomers.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setShowCustomerDropdown(false) }}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0 ${c.balance > 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                          {c.balance > 0 && <p className="text-xs text-red-500">Owes {formatCurrency(c.balance)}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Item Search */}
          <div ref={itemSearchRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Items <span className="text-red-500">*</span></label>
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
                className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
              />
            </div>
            {showItemDropdown && filteredItems.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                {filteredItems.map(item => {
                  const inCart = cart.find(c => c.itemId === item.id)
                  const outOfStock = item.quantity === 0 && !inCart
                  return (
                    <button key={item.id} type="button"
                      onClick={() => !outOfStock && addToCart(item)} disabled={!!outOfStock}
                      className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 flex items-center justify-between gap-3 ${outOfStock ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-blue-50 cursor-pointer'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-blue-600 font-medium">{item.manufacturer?.name || 'Unknown'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-800 text-sm">{formatCurrency(item.sellingPrice)}</p>
                        <p className={`text-xs ${outOfStock ? 'text-red-500' : 'text-gray-500'}`}>{outOfStock ? 'Out of stock' : `${item.quantity} left`}</p>
                      </div>
                      {inCart && <span className="ml-1 w-5 h-5 bg-blue-600 -full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{inCart.quantity}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})</span>
                <button type="button" onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear all</button>
              </div>
              <div className="divide-y divide-gray-200">
                {cart.map(item => (
                  <div key={item.itemId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-blue-600">{item.manufacturer}</p>
                      </div>
                      <button type="button" onClick={() => setCart(prev => prev.filter(c => c.itemId !== item.itemId))}
                        className="text-red-400 hover:text-red-600 text-xl leading-none flex-shrink-0 mt-0.5">×</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Qty</label>
                        <div className="flex items-center border-2 border-gray-200 overflow-hidden bg-white">
                          <button type="button" onClick={() => updateQty(item.itemId, item.quantity - 1)}
                            className="px-2.5 py-2 text-gray-600 hover:bg-gray-100 font-bold text-base">−</button>
                          <input type="number" value={item.quantity}
                            onChange={e => updateQty(item.itemId, parseInt(e.target.value) || 1)}
                            min={1} className="w-full text-center text-sm font-bold text-gray-900 focus:outline-none py-2 bg-white" />
                          <button type="button" onClick={() => updateQty(item.itemId, item.quantity + 1)}
                            className="px-2.5 py-2 text-gray-600 hover:bg-gray-100 font-bold text-base">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Price (GH₵)</label>
                        <input type="number" value={item.price}
                          onChange={e => updatePrice(item.itemId, parseFloat(e.target.value) || 0)}
                          step="0.01" min="0"
                          className="w-full px-2 py-2 border-2 border-gray-200 text-sm font-bold bg-white focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Subtotal (GH₵)</label>
                        <div className="px-2 py-2 bg-white border-2 border-gray-200 text-sm font-bold text-right text-gray-900">
                          {(item.price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment */}
          {cart.length > 0 && (
            <div className={`border-2 p-5 space-y-4 ${paymentType === 'CASH' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-800">Total</span>
                <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
              </div>
              {paymentType === 'CASH' ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Received (GH₵)</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      step="0.01" min="0" placeholder={totalAmount > 0 ? totalAmount.toFixed(2) : '0.00'}
                      className="w-full px-4 py-3 border-2 border-blue-200 focus:border-blue-500 focus:outline-none text-xl font-bold bg-white" />
                  </div>
                  {amountPaid !== '' && change >= 0 && (
                    <div className="flex justify-between items-center bg-green-100 p-3">
                      <span className="text-sm font-semibold text-green-800">Change:</span>
                      <span className="text-xl font-bold text-green-700">{formatCurrency(change)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Deposit / Part Payment (GH₵) <span className="text-gray-400 font-normal">optional</span></label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      step="0.01" min="0" max={totalAmount} placeholder="0.00"
                      className="w-full px-4 py-3 border-2 border-orange-200 focus:border-orange-400 focus:outline-none text-xl font-bold bg-white" />
                  </div>
                  <div className="flex justify-between items-center bg-orange-100 p-3">
                    <span className="text-sm font-semibold text-orange-800">Credit owed:</span>
                    <span className="text-xl font-bold text-orange-700">{formatCurrency(Math.max(0, creditAmount))}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">⚠ {formError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="submit" disabled={isSubmitting || cart.length === 0}
              className={`flex-1 py-4 text-white text-base font-bold disabled:opacity-50 transition-all shadow-md ${paymentType === 'CASH' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
              {isSubmitting ? 'Saving…' : `Save Changes — ${formatCurrency(totalAmount)}`}
            </button>
            <button type="button" onClick={() => router.push(`/sales/${id}`)} disabled={isSubmitting}
              className="sm:w-32 py-4 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
