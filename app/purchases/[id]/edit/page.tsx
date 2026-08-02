'use client'

import { useState, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useItems } from '@/hooks/useItems'
import { useSuppliers } from '@/hooks/useSuppliers'
import { formatCurrency } from '@/lib/utils/format'

interface CartItem {
  itemId: string
  name: string
  manufacturer: string
  quantity: number
  costPrice: number
}

export default function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [purchaseType, setPurchaseType] = useState<'CASH' | 'CREDIT'>('CASH')
  const [cart, setCart] = useState<CartItem[]>([])
  const [depositPaid, setDepositPaid] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)

  const supplierSearchRef = useRef<HTMLDivElement>(null)
  const itemSearchRef = useRef<HTMLDivElement>(null)

  const { items } = useItems()
  const { suppliers } = useSuppliers()

  // Load existing purchase
  useEffect(() => {
    fetch(`/api/purchases/${id}`)
      .then(r => r.json())
      .then(purchase => {
        if (purchase.error) { setLoadError(purchase.error); return }
        setPurchaseType(purchase.paymentType)
        setDepositPaid(String(purchase.paidAmount))
        if (purchase.supplier) {
          setSelectedSupplier({ id: purchase.supplier.id, name: purchase.supplier.name, balance: purchase.supplier.balance })
        }
        setCart(purchase.items.map((pi: { itemId: string; quantity: number; costPrice: number; item: { name: string; manufacturer?: { name: string } } }) => ({
          itemId: pi.itemId,
          name: pi.item.name,
          manufacturer: pi.item.manufacturer?.name || 'Unknown',
          quantity: pi.quantity,
          costPrice: pi.costPrice,
        })))
      })
      .catch(() => setLoadError('Failed to load purchase'))
      .finally(() => setLoading(false))
  }, [id])

  // Close dropdowns on outside click
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
      if (existing) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        itemId: item.id,
        name: item.name,
        manufacturer: item.manufacturer?.name || 'Unknown',
        quantity: 1,
        costPrice: item.costPrice,
      }]
    })
    setItemSearch('')
    setShowItemDropdown(false)
  }

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(c => c.itemId !== itemId))
    else setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c))
  }

  const updateCostPrice = (itemId: string, price: number) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, costPrice: Math.max(0, price) } : c))
  }

  const totalAmount = cart.reduce((sum, c) => sum + c.costPrice * c.quantity, 0)
  const depositNum = parseFloat(depositPaid) || 0
  const owedToSupplier = totalAmount - depositNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!selectedSupplier) { setFormError('Please select a supplier'); return }
    if (cart.length === 0) { setFormError('Add at least one item'); return }

    const paid = purchaseType === 'CASH' ? totalAmount : (depositNum >= 0 && depositNum <= totalAmount ? depositNum : 0)

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          paymentType: purchaseType,
          paidAmount: paid,
          items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity, costPrice: c.costPrice })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      router.push('/purchases')
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
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent -full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-red-600 font-semibold">{loadError}</p>
          <button onClick={() => router.back()} className="mt-4 text-green-600 underline text-sm">Go back</button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/purchases')} className="p-2 hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Purchase</h1>
            <p className="text-sm text-gray-500 font-mono">{id}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Purchase Type Toggle */}
          <div className="grid grid-cols-2 gap-3">
            {(['CASH', 'CREDIT'] as const).map(type => (
              <button key={type} type="button" onClick={() => setPurchaseType(type)}
                className={`py-4 font-bold text-base transition-all border-2 flex flex-col items-center gap-1 ${
                  purchaseType === type
                    ? type === 'CASH' ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-amber-500 text-white border-amber-500 shadow-lg'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                <span className="text-2xl">{type === 'CASH' ? '💵' : '📦'}</span>
                <span>{type === 'CASH' ? 'Cash Purchase' : 'Purchase Order'}</span>
                <span className={`text-xs font-normal ${purchaseType === type ? 'text-white/70' : 'text-gray-400'}`}>
                  {type === 'CASH' ? 'Pay in full now' : 'Pay later / credit'}
                </span>
              </button>
            ))}
          </div>

          {/* Supplier */}
          <div ref={supplierSearchRef} className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier <span className="text-red-500">*</span></label>
            {selectedSupplier ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-200">
                <div className="w-9 h-9 bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {selectedSupplier.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{selectedSupplier.name}</p>
                  {selectedSupplier.balance > 0 && (
                    <p className="text-xs text-amber-600">You owe: {formatCurrency(selectedSupplier.balance)}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setSelectedSupplier(null); setSupplierSearch('') }}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0">×</button>
              </div>
            ) : (
              <div>
                <input type="text" placeholder="Search supplier by name..."
                  value={supplierSearch}
                  onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true) }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  className="w-full px-4 py-3 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-base" />
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                    {filteredSuppliers.map(s => (
                      <button key={s.id} type="button"
                        onClick={() => { setSelectedSupplier(s); setSupplierSearch(''); setShowSupplierDropdown(false) }}
                        className="w-full px-4 py-3 text-left hover:bg-green-50 flex items-center gap-3 border-b border-gray-100 last:border-0">
                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0 ${s.balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
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
              <input type="text" placeholder="Search items..."
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true) }}
                onFocus={() => setShowItemDropdown(true)}
                className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 focus:border-green-500 focus:outline-none text-base" />
            </div>
            {showItemDropdown && filteredItems.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                {filteredItems.map(item => {
                  const inCart = cart.find(c => c.itemId === item.id)
                  return (
                    <button key={item.id} type="button" onClick={() => addToCart(item)}
                      className="w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 flex items-center justify-between gap-3 hover:bg-green-50 cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-blue-600 font-medium">{item.manufacturer?.name || 'Unknown'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-800 text-sm">{formatCurrency(item.costPrice)}</p>
                        <p className="text-xs text-gray-500">Stock: {item.quantity}</p>
                      </div>
                      {inCart && <span className="ml-1 w-5 h-5 bg-green-600 -full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{inCart.quantity}</span>}
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
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Order ({cart.length} item{cart.length !== 1 ? 's' : ''})</span>
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
                        <label className="text-xs text-gray-500 mb-1 block">Cost (GH₵)</label>
                        <input type="number" value={item.costPrice}
                          onChange={e => updateCostPrice(item.itemId, parseFloat(e.target.value) || 0)}
                          step="0.01" min="0"
                          className="w-full px-2 py-2 border-2 border-gray-200 text-sm font-bold bg-white focus:border-green-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Subtotal</label>
                        <div className="px-2 py-2 bg-white border-2 border-gray-200 text-sm font-bold text-right text-gray-900">
                          {formatCurrency(item.costPrice * item.quantity)}
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
            <div className={`border-2 p-5 space-y-4 ${purchaseType === 'CASH' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-800">Total</span>
                <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
              </div>
              {purchaseType === 'CASH' ? (
                <div className="flex items-center gap-3 bg-green-100 p-3">
                  <span className="text-green-700 text-xl">✓</span>
                  <div>
                    <p className="text-sm font-bold text-green-800">Paying in full — {formatCurrency(totalAmount)}</p>
                    <p className="text-xs text-green-700">No balance added to supplier</p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Deposit / Part Payment (GH₵) <span className="text-gray-400 font-normal">optional</span></label>
                    <input type="number" value={depositPaid} onChange={e => setDepositPaid(e.target.value)}
                      step="0.01" min="0" max={totalAmount} placeholder="0.00"
                      className="w-full px-4 py-3 border-2 border-amber-200 focus:border-amber-500 focus:outline-none text-xl font-bold bg-white" />
                  </div>
                  <div className="flex justify-between items-center bg-amber-100 p-3">
                    <span className="text-sm font-semibold text-amber-800">Owed to supplier:</span>
                    <span className="text-xl font-bold text-amber-700">{formatCurrency(Math.max(0, owedToSupplier))}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">⚠ {formError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="submit" disabled={isSubmitting || cart.length === 0 || !selectedSupplier}
              className={`flex-1 py-4 text-white text-base font-bold disabled:opacity-50 transition-all shadow-md ${purchaseType === 'CASH' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
              {isSubmitting ? 'Saving…' : `Save Changes — ${formatCurrency(totalAmount)}`}
            </button>
            <button type="button" onClick={() => router.push('/purchases')} disabled={isSubmitting}
              className="sm:w-32 py-4 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
