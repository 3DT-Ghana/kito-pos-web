'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useBranch } from '@/lib/branch/BranchContext'
import { useTenantFeatures } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils/format'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PosCategory {
  id: string
  name: string
  color: string | null
  icon: string | null
}

interface PosItem {
  id: string
  name: string
  barcode: string | null
  sellingPrice: number
  retailPrice: number | null
  wholesalePrice: number | null
  promoPrice: number | null
  quantity: number
  unitName: string | null
  piecesPerUnit: number | null
  manufacturer: { id: string; name: string } | null
  category: PosCategory | null
}

type PriceTier = 'sellingPrice' | 'retailPrice' | 'wholesalePrice' | 'promoPrice'

interface CartLine {
  itemId: string
  name: string
  basePrice: number       // price from the selected tier
  activeTier: PriceTier
  qty: number
  maxStock: number
  lineDiscount: number    // fixed currency discount per line
  unitName: string | null
  // snapshot of all available tiers for switching mid-cart
  tiers: { sellingPrice: number; retailPrice: number | null; wholesalePrice: number | null; promoPrice: number | null }
}

interface HeldOrder {
  id: string
  label: string
  cart: CartLine[]
  customerId: string | null
  customerName: string
  note: string
  savedAt: number
}

interface Customer {
  id: string
  name: string
  phone: string | null
  balance: number
}

type PaymentMethod = 'CASH' | 'MOMO' | 'BANK'
type MobileTab = 'items' | 'cart'
type DiscountMode = 'pct' | 'fixed'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOLD_KEY = 'pos_held_orders'
const LOW_STOCK_THRESHOLD = 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lineTotal(line: CartLine) {
  return Math.max(0, line.basePrice * line.qty - line.lineDiscount)
}

function loadHolds(): HeldOrder[] {
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? '[]') } catch { return [] }
}

function saveHolds(holds: HeldOrder[]) {
  localStorage.setItem(HOLD_KEY, JSON.stringify(holds))
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PosPage() {
  const router = useRouter()
  const { user } = useUser()
  const { currentBranch } = useBranch()
  const { features } = useTenantFeatures()

  // Catalog
  const [allItems, setAllItems] = useState<PosItem[]>([])
  const [categories, setCategories] = useState<PosCategory[]>([])
  const [activeGroup, setActiveGroup] = useState<string>('ALL')
  const [isLoadingItems, setIsLoadingItems] = useState(true)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Cart
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedCartIdx, setSelectedCartIdx] = useState<number | null>(null)
  const [note, setNote] = useState('')

  // Customer
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const customerSearchRef = useRef<HTMLInputElement>(null)

  // Price tier (applies to new adds; per-line can also override)
  const [globalTier, setGlobalTier] = useState<PriceTier>('sellingPrice')

  // Order-level discount
  const [orderDiscountMode, setOrderDiscountMode] = useState<DiscountMode>('pct')
  const [orderDiscountValue, setOrderDiscountValue] = useState('')

  // Payment
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [tendered, setTendered] = useState('')
  const [numpadBuffer, setNumpadBuffer] = useState('')
  const [numpadTarget, setNumpadTarget] = useState<'tendered' | 'qty' | 'lineDiscount'>('tendered')

  // Line-discount editing
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null)
  const [discountBuffer, setDiscountBuffer] = useState('')

  // Holds
  const [holds, setHolds] = useState<HeldOrder[]>([])
  const [showHolds, setShowHolds] = useState(false)

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSaleData, setLastSaleData] = useState<null | {
    id: string; receiptNumber: string; date: string; time: string
    items: CartLine[]; subtotal: number; orderDiscount: number; total: number
    paidAmount: number; change: number; method: PaymentMethod
    customerName: string; note: string
  }>(null)

  // UX
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [flashSuccess, setFlashSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [mobileTab, setMobileTab] = useState<MobileTab>('items')

  // ── Load items ──────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setIsLoadingItems(true)
    try {
      const res = await fetch('/api/pos/items?limit=200')
      if (res.ok) {
        const data = await res.json()
        setAllItems(data.items ?? [])
        setCategories(data.categories ?? [])
      }
    } finally { setIsLoadingItems(false) }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => { setHolds(loadHolds()) }, [])

  // ── Customer search ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(customerQuery)}&limit=8`)
      if (res.ok) {
        const data = await res.json()
        setCustomerResults(Array.isArray(data) ? data : (data.customers ?? []))
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery])

  // ── Derived values ──────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase()

  const groupFiltered = activeGroup === 'ALL'
    ? allItems
    : allItems.filter(i => i.category?.id === activeGroup)

  const displayItems = q
    ? groupFiltered.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.startsWith(search.trim()))
      )
    : groupFiltered.slice(0, 80)

  const cartSubtotal = cart.reduce((s, c) => s + lineTotal(c), 0)

  const orderDiscountNum = (() => {
    const v = parseFloat(orderDiscountValue) || 0
    if (orderDiscountMode === 'pct') return Math.min(100, v) / 100 * cartSubtotal
    return Math.min(v, cartSubtotal)
  })()

  const grandTotal = Math.max(0, cartSubtotal - orderDiscountNum)
  const tenderedNum = parseFloat(tendered) || 0
  const change = tenderedNum - grandTotal

  // ── Cart helpers ────────────────────────────────────────────────────────────

  function resolvePrice(item: PosItem, tier: PriceTier): number {
    return (item[tier] as number | null) ?? item.sellingPrice
  }

  const addToCart = (item: PosItem) => {
    const price = resolvePrice(item, globalTier)
    setCart(prev => {
      const idx = prev.findIndex(c => c.itemId === item.id)
      if (idx !== -1) {
        return prev.map((c, i) =>
          i === idx ? { ...c, qty: Math.min(c.qty + 1, c.maxStock) } : c
        )
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        basePrice: price,
        activeTier: globalTier,
        qty: 1,
        maxStock: item.quantity,
        lineDiscount: 0,
        unitName: item.unitName,
        tiers: {
          sellingPrice: item.sellingPrice,
          retailPrice: item.retailPrice,
          wholesalePrice: item.wholesalePrice,
          promoPrice: item.promoPrice,
        },
      }]
    })
    setSearch('')
    searchRef.current?.focus()
  }

  const removeFromCart = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
    if (selectedCartIdx === idx) setSelectedCartIdx(null)
  }

  const updateQty = (idx: number, qty: number) => {
    if (qty <= 0) { removeFromCart(idx); return }
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: Math.min(qty, c.maxStock) } : c))
  }

  const setLineTier = (idx: number, tier: PriceTier) => {
    setCart(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const price = (c.tiers[tier] as number | null) ?? c.tiers.sellingPrice
      return { ...c, activeTier: tier, basePrice: price }
    }))
  }

  const setLineDiscount = (idx: number, discount: number) => {
    setCart(prev => prev.map((c, i) =>
      i === idx ? { ...c, lineDiscount: Math.max(0, Math.min(discount, c.basePrice * c.qty)) } : c
    ))
  }

  const clearCart = () => { setCart([]); setSelectedCartIdx(null); setNote('') }

  // ── Barcode / keyboard search ───────────────────────────────────────────────

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const exact = allItems.find(i => i.barcode === search.trim())
      if (exact) { addToCart(exact); return }
      if (displayItems.length === 1) { addToCart(displayItems[0]); return }
    }
    if (e.key === 'Escape') { setSearch(''); searchRef.current?.focus() }
  }

  // ── Numpad ──────────────────────────────────────────────────────────────────

  const numpadPress = (key: string) => {
    if (numpadTarget === 'qty' && selectedCartIdx !== null) {
      let buf = numpadBuffer
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') {
        updateQty(selectedCartIdx, parseInt(buf, 10) || 1)
        setNumpadBuffer(''); setSelectedCartIdx(null); setNumpadTarget('tendered')
        return
      } else buf = buf + key
      setNumpadBuffer(buf)
    } else if (numpadTarget === 'lineDiscount' && editingDiscountIdx !== null) {
      let buf = discountBuffer
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') {
        setLineDiscount(editingDiscountIdx, parseFloat(buf) || 0)
        setDiscountBuffer(''); setEditingDiscountIdx(null); setNumpadTarget('tendered')
        return
      } else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setDiscountBuffer(buf)
    } else {
      let buf = tendered
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') { /* checkout button handles this */ }
      else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setTendered(buf)
    }
  }

  // ── Quick quantity multiplier ───────────────────────────────────────────────

  const quickQty = (idx: number, qty: number) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: Math.min(qty, c.maxStock) } : c))
  }

  // ── Holds ───────────────────────────────────────────────────────────────────

  const holdOrder = () => {
    if (cart.length === 0) return
    const id = Date.now().toString()
    const label = `Order #${holds.length + 1}${selectedCustomer ? ` — ${selectedCustomer.name}` : ''}`
    const newHold: HeldOrder = {
      id, label, cart, customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer?.name ?? '', note, savedAt: Date.now(),
    }
    const updated = [...holds, newHold]
    setHolds(updated); saveHolds(updated)
    clearCart(); setSelectedCustomer(null); setCustomerQuery('')
    setNote('')
  }

  const recallHold = (hold: HeldOrder) => {
    setCart(hold.cart)
    setNote(hold.note)
    if (hold.customerId) {
      setSelectedCustomer({ id: hold.customerId, name: hold.customerName, phone: null, balance: 0 })
      setCustomerQuery(hold.customerName)
    }
    const updated = holds.filter(h => h.id !== hold.id)
    setHolds(updated); saveHolds(updated)
    setShowHolds(false)
  }

  const deleteHold = (id: string) => {
    const updated = holds.filter(h => h.id !== id)
    setHolds(updated); saveHolds(updated)
  }

  // ── Checkout ────────────────────────────────────────────────────────────────

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return
    setErrorMsg('')
    setIsSubmitting(true)
    try {
      const paidAmount = method === 'CASH'
        ? (tenderedNum > 0 ? Math.min(tenderedNum, grandTotal) : grandTotal)
        : grandTotal

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer?.id ?? null,
          items: cart.map(c => ({
            itemId: c.itemId,
            quantity: c.qty,
            price: c.basePrice,
            discountAmount: c.lineDiscount + (orderDiscountNum > 0
              ? orderDiscountNum * (lineTotal(c) / cartSubtotal)  // prorate order discount
              : 0),
          })),
          paidAmount,
          paymentMethod: method,
          note,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to record sale')
      }
      const result = await res.json()
      const now = new Date()
      setLastSaleData({
        id: result.id ?? result.data?.id ?? '',
        receiptNumber: result.id?.slice(-8).toUpperCase() ?? '—',
        date: now.toLocaleDateString('en-GH'),
        time: now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }),
        items: [...cart],
        subtotal: cartSubtotal,
        orderDiscount: orderDiscountNum,
        total: grandTotal,
        paidAmount,
        change: method === 'CASH' && tenderedNum > grandTotal ? tenderedNum - grandTotal : 0,
        method,
        customerName: selectedCustomer?.name ?? '',
        note,
      })
      setFlashSuccess(true)
      setTimeout(() => {
        setFlashSuccess(false)
        setShowReceipt(true)
        clearCart()
        setTendered('')
        setNumpadBuffer('')
        setSelectedCustomer(null)
        setCustomerQuery('')
        setOrderDiscountValue('')
        setNote('')
        setMobileTab('items')
        loadItems()
        searchRef.current?.focus()
      }, 1500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Sale-complete flash ─────────────────────────────────────────────────────
  if (flashSuccess) {
    return (
      <div className="fixed inset-0 bg-green-600 flex flex-col items-center justify-center text-white z-50">
        <div className="text-7xl mb-4">✓</div>
        <h2 className="text-3xl font-bold">Sale Complete!</h2>
        <p className="text-xl opacity-80 mt-2">{formatCurrency(grandTotal)}</p>
      </div>
    )
  }

  // ── Receipt modal ───────────────────────────────────────────────────────────
  if (showReceipt && lastSaleData) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
            <span className="font-bold text-gray-800">Receipt #{lastSaleData.receiptNumber}</span>
            <button onClick={() => setShowReceipt(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="p-4 space-y-3 font-mono text-sm max-h-[70vh] overflow-y-auto">
            <div className="text-center border-b pb-3">
              <div className="font-bold text-base">{currentBranch?.name ?? 'PETROS'}</div>
              <div className="text-xs text-gray-500">{lastSaleData.date} · {lastSaleData.time}</div>
              {lastSaleData.customerName && <div className="mt-1 text-xs">Customer: {lastSaleData.customerName}</div>}
            </div>
            <div className="space-y-1">
              {lastSaleData.items.map((line, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{line.name}</div>
                    <div className="text-xs text-gray-500">{line.qty} × {formatCurrency(line.basePrice)}{line.lineDiscount > 0 ? ` - ${formatCurrency(line.lineDiscount)} disc.` : ''}</div>
                  </div>
                  <div className="font-semibold shrink-0">{formatCurrency(lineTotal(line))}</div>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(lastSaleData.subtotal)}</span></div>
              {lastSaleData.orderDiscount > 0 && (
                <div className="flex justify-between text-green-700"><span>Discount</span><span>− {formatCurrency(lastSaleData.orderDiscount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>TOTAL</span><span>{formatCurrency(lastSaleData.total)}</span></div>
              {lastSaleData.method === 'CASH' && lastSaleData.change > 0 && (
                <>
                  <div className="flex justify-between text-gray-600"><span>Tendered</span><span>{formatCurrency(lastSaleData.paidAmount + lastSaleData.change)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Change</span><span>{formatCurrency(lastSaleData.change)}</span></div>
                </>
              )}
              <div className="flex justify-between text-gray-500 text-xs"><span>Payment</span><span>{lastSaleData.method}</span></div>
            </div>
            {lastSaleData.note && <div className="text-xs text-gray-500 border-t pt-2">Note: {lastSaleData.note}</div>}
            <div className="text-center text-xs text-gray-400 border-t pt-2">Thank you for your business!</div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => window.open(`/sales/${lastSaleData.id}`, '_blank')}
              className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm"
            >
              Print Receipt
            </button>
            <button
              onClick={() => setShowReceipt(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm"
            >
              New Sale
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Holds modal ─────────────────────────────────────────────────────────────
  const HoldsModal = () => (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b">
          <span className="font-bold text-gray-800">Held Orders ({holds.length})</span>
          <button onClick={() => setShowHolds(false)} className="text-gray-400 text-xl">×</button>
        </div>
        {holds.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No held orders</div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {holds.map(hold => (
              <div key={hold.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{hold.label}</p>
                  <p className="text-xs text-gray-400">{hold.cart.length} items · {new Date(hold.savedAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <button onClick={() => recallHold(hold)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg">Recall</button>
                <button onClick={() => deleteHold(hold.id)} className="px-2 py-1.5 bg-red-50 text-red-500 text-xs font-bold rounded-lg">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Customer search panel ───────────────────────────────────────────────────
  const CustomerPanel = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? '' : 'px-3 pb-2'}>
      {!compact && <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Customer</p>}
      {selectedCustomer ? (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{selectedCustomer.name}</p>
            {selectedCustomer.balance > 0 && (
              <p className="text-xs text-amber-600 font-medium">Balance: {formatCurrency(selectedCustomer.balance)}</p>
            )}
          </div>
          <button
            onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
            className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
          >×</button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={compact ? undefined : customerSearchRef}
            type="text"
            value={customerQuery}
            onChange={e => { setCustomerQuery(e.target.value); setShowCustomerSearch(true) }}
            onFocus={() => setShowCustomerSearch(true)}
            placeholder="Search customer..."
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none"
          />
          {showCustomerSearch && customerResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
              {customerResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCustomer(c); setCustomerQuery(c.name); setShowCustomerSearch(false) }}
                  className="w-full px-3 py-2.5 text-left hover:bg-indigo-50 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </div>
                  {c.balance > 0 && (
                    <span className="text-xs text-amber-600 font-semibold shrink-0">{formatCurrency(c.balance)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Numpad ──────────────────────────────────────────────────────────────────
  const Numpad = () => (
    <div className="px-3 py-2 bg-white">
      {numpadTarget !== 'tendered' && (
        <div className="mb-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
          {numpadTarget === 'qty' ? `Setting qty${numpadBuffer ? ` → ${numpadBuffer}` : ''}` : `Setting discount${discountBuffer ? ` → ${discountBuffer}` : ''}`}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {['7','8','9','4','5','6','1','2','3','.','0','←'].map(k => (
          <button
            key={k}
            onClick={() => numpadPress(k)}
            className="py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-base font-bold text-gray-800 active:scale-95 touch-manipulation transition-colors"
          >
            {k}
          </button>
        ))}
        <button onClick={() => numpadPress('C')} className="py-3 bg-red-100 rounded-xl text-sm font-bold text-red-700 active:scale-95 touch-manipulation">C</button>
        <button onClick={() => numpadPress('00')} className="py-3 bg-gray-100 rounded-xl text-base font-bold text-gray-800 active:scale-95 touch-manipulation">00</button>
        <button onClick={() => numpadPress('✓')} className="py-3 bg-green-100 rounded-xl text-base font-bold text-green-700 active:scale-95 touch-manipulation">✓</button>
      </div>
    </div>
  )

  // ── Cart line row (shared between mobile and desktop) ───────────────────────
  const CartLineRow = ({ line, idx, mobile = false }: { line: CartLine; idx: number; mobile?: boolean }) => {
    const isSelected = selectedCartIdx === idx
    const tierOptions: { key: PriceTier; label: string }[] = [
      { key: 'sellingPrice', label: 'Default' },
      ...(features.enableRetailPrice && line.tiers.retailPrice != null ? [{ key: 'retailPrice' as PriceTier, label: 'Retail' }] : []),
      ...(features.enableWholesalePrice && line.tiers.wholesalePrice != null ? [{ key: 'wholesalePrice' as PriceTier, label: 'Wholesale' }] : []),
      ...(features.enablePromoPrice && line.tiers.promoPrice != null ? [{ key: 'promoPrice' as PriceTier, label: 'Promo' }] : []),
    ]
    const hasMultipleTiers = tierOptions.length > 1

    return (
      <div
        className={`px-3 py-2.5 border-b border-gray-100 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}
      >
        {/* Main row */}
        <div className="flex items-center gap-2">
          {/* Name + price */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedCartIdx(isSelected ? null : idx)}>
            <p className="text-sm font-semibold text-gray-900 truncate">{line.name}</p>
            <p className="text-xs text-gray-400">
              {formatCurrency(line.basePrice)}
              {line.lineDiscount > 0 && <span className="text-green-600 ml-1">− {formatCurrency(line.lineDiscount)} disc.</span>}
            </p>
          </div>
          {/* Qty controls */}
          {mobile ? (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => updateQty(idx, line.qty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation">−</button>
              <span className="w-6 text-center text-sm font-bold">{line.qty}</span>
              <button onClick={() => updateQty(idx, line.qty + 1)} className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation">+</button>
            </div>
          ) : (
            <button
              onClick={() => { setSelectedCartIdx(isSelected ? null : idx); setNumpadTarget('qty'); setNumpadBuffer(String(line.qty)) }}
              className="w-9 h-9 rounded-lg bg-gray-100 font-bold text-gray-700 text-sm flex items-center justify-center hover:bg-indigo-100 transition-colors"
            >
              {line.qty}
            </button>
          )}
          {/* Line total */}
          <p className="text-sm font-bold text-gray-900 w-16 text-right shrink-0">{formatCurrency(lineTotal(line))}</p>
          {/* Remove */}
          <button onClick={() => removeFromCart(idx)} className="text-red-300 hover:text-red-500 text-xl leading-none shrink-0">×</button>
        </div>

        {/* Expanded controls on desktop or when selected on mobile */}
        {(isSelected || !mobile) && isSelected && (
          <div className="mt-2 space-y-2">
            {/* Quick qty presets */}
            <div className="flex gap-1 flex-wrap">
              {[1, 2, 3, 5, 10, 20].map(n => (
                <button
                  key={n}
                  onClick={() => quickQty(idx, n)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                    line.qty === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  ×{n}
                </button>
              ))}
            </div>
            {/* Price tier */}
            {hasMultipleTiers && (
              <div className="flex gap-1 flex-wrap">
                {tierOptions.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setLineTier(idx, t.key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                      line.activeTier === t.key ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    {t.label} {line.tiers[t.key] != null ? formatCurrency(line.tiers[t.key] as number) : ''}
                  </button>
                ))}
              </div>
            )}
            {/* Line discount */}
            {features.enableDiscounts && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Line disc.:</span>
                {mobile ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={line.lineDiscount || ''}
                    onChange={e => setLineDiscount(idx, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold focus:border-indigo-400 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingDiscountIdx(idx)
                      setDiscountBuffer(line.lineDiscount ? String(line.lineDiscount) : '')
                      setNumpadTarget('lineDiscount')
                      setSelectedCartIdx(idx)
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 hover:border-indigo-300 bg-white"
                  >
                    {line.lineDiscount > 0 ? `− ${formatCurrency(line.lineDiscount)}` : 'Add discount'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Payment panel (shared) ──────────────────────────────────────────────────
  const PaymentPanel = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? 'px-3 pb-2' : 'px-3 pb-3'}>
      {/* Order-level discount */}
      {features.enableDiscounts && (
        <div className="mb-2">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Order Discount</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setOrderDiscountMode('pct')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${orderDiscountMode === 'pct' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >%</button>
            <button
              onClick={() => setOrderDiscountMode('fixed')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${orderDiscountMode === 'fixed' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >GHS</button>
            <input
              type="number"
              inputMode="decimal"
              value={orderDiscountValue}
              onChange={e => setOrderDiscountValue(e.target.value)}
              placeholder={orderDiscountMode === 'pct' ? '0%' : '0.00'}
              className="flex-1 px-2.5 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold focus:border-indigo-400 focus:outline-none"
            />
          </div>
          {orderDiscountNum > 0 && (
            <p className="text-xs text-green-700 font-semibold mt-1">Saving {formatCurrency(orderDiscountNum)}</p>
          )}
        </div>
      )}

      {/* Totals summary */}
      <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-2 space-y-1">
        {cartSubtotal !== grandTotal && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Subtotal</span><span>{formatCurrency(cartSubtotal)}</span>
          </div>
        )}
        {orderDiscountNum > 0 && (
          <div className="flex justify-between text-xs text-green-700 font-semibold">
            <span>Discount</span><span>− {formatCurrency(orderDiscountNum)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-gray-900">
          <span>TOTAL</span><span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {(['CASH', 'MOMO', 'BANK'] as PaymentMethod[]).map(m => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-colors touch-manipulation ${
              method === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}
          >
            {m === 'CASH' ? '💵' : m === 'MOMO' ? '📱' : '🏦'} {m}
          </button>
        ))}
      </div>

      {/* Tendered */}
      {method === 'CASH' && (
        <div className="mb-2">
          <input
            type="number"
            inputMode="decimal"
            value={tendered}
            onChange={e => setTendered(e.target.value)}
            onFocus={() => setNumpadTarget('tendered')}
            placeholder={`Tendered (e.g. ${grandTotal > 0 ? grandTotal.toFixed(2) : '0.00'})`}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold focus:border-indigo-400 focus:outline-none"
          />
          {tendered && change >= 0 && (
            <div className="mt-1 flex justify-between text-sm font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-xl">
              <span>Change</span><span>{formatCurrency(change)}</span>
            </div>
          )}
          {tendered && change < 0 && (
            <div className="mt-1 flex justify-between text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl">
              <span>Short</span><span>{formatCurrency(Math.abs(change))}</span>
            </div>
          )}
        </div>
      )}

      {/* Credit sale indicator */}
      {features.enableCreditSales && selectedCustomer && method === 'CASH' && tenderedNum > 0 && change < 0 && (
        <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
          {formatCurrency(Math.abs(change))} will be added to {selectedCustomer.name}'s balance
        </div>
      )}

      {/* Note */}
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Sale note (optional)"
        className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-none mb-2"
      />

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-xl mb-2">{errorMsg}</p>
      )}

      <button
        onClick={handleCheckout}
        disabled={cart.length === 0 || isSubmitting}
        className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-2xl text-base transition-colors active:scale-95 shadow-md touch-manipulation"
      >
        {isSubmitting ? 'Processing…' : `✓ Charge ${formatCurrency(grandTotal)}`}
      </button>
    </div>
  )

  // ── Item grid tile ──────────────────────────────────────────────────────────
  const ItemTile = ({ item }: { item: PosItem }) => {
    const inCart = cart.find(c => c.itemId === item.id)
    const isLow = item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD
    const displayPrice = resolvePrice(item, globalTier)
    return (
      <button
        onClick={() => addToCart(item)}
        className={`relative flex flex-col items-center justify-center p-2 rounded-xl border-2 text-center transition-all active:scale-95 touch-manipulation ${
          inCart
            ? 'bg-indigo-50 border-indigo-400 shadow-md'
            : isLow
            ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
            : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
        }`}
      >
        {inCart && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {inCart.qty}
          </span>
        )}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base mb-1 ${
            isLow ? 'bg-amber-100 text-amber-700' : ''
          }`}
          style={!isLow && item.category?.color
            ? { backgroundColor: item.category.color + '22', color: item.category.color }
            : !isLow
            ? { backgroundColor: inCart ? '#c7d2fe' : '#e0e7ff', color: inCart ? '#3730a3' : '#4338ca' }
            : {}
          }
        >
          {item.category?.icon ?? item.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-[11px] font-semibold text-gray-900 leading-tight line-clamp-2 w-full">{item.name}</p>
        <p className="text-[11px] font-bold text-indigo-600 mt-0.5">{formatCurrency(displayPrice)}</p>
        <p className={`text-[9px] mt-0.5 font-medium ${isLow ? 'text-amber-600' : 'text-gray-400'}`}>
          {isLow ? `⚠ ${item.quantity} left` : `Stk: ${item.quantity}`}
        </p>
      </button>
    )
  }

  // ── Search bar ──────────────────────────────────────────────────────────────
  const SearchBar = ({ compact = false }: { compact?: boolean }) => (
    <div className={`bg-white border-b border-gray-200 shrink-0 ${compact ? 'px-3 pt-2 pb-2' : 'px-4 pt-3 pb-2'}`}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveGroup('ALL') }}
          onKeyDown={handleSearchKey}
          placeholder="Search item or scan barcode…"
          className={`w-full pl-9 pr-4 border-2 border-indigo-300 rounded-xl focus:border-indigo-500 focus:outline-none font-medium ${compact ? 'py-2 text-sm' : 'py-2.5 text-sm'}`}
          autoComplete="off"
        />
      </div>
      {/* Global price tier selector */}
      {(features.enableRetailPrice || features.enableWholesalePrice || features.enablePromoPrice) && (
        <div className="flex gap-1 mt-2">
          {([
            { key: 'sellingPrice', label: 'Default' },
            ...(features.enableRetailPrice ? [{ key: 'retailPrice', label: 'Retail' }] : []),
            ...(features.enableWholesalePrice ? [{ key: 'wholesalePrice', label: 'Wholesale' }] : []),
            ...(features.enablePromoPrice ? [{ key: 'promoPrice', label: 'Promo' }] : []),
          ] as { key: PriceTier; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setGlobalTier(t.key)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border-2 transition-colors ${
                globalTier === t.key ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ── Category / group tab bar ────────────────────────────────────────────────
  const CategoryTabs = () => {
    if (categories.length === 0) return null
    return (
      <div className="shrink-0 bg-white border-b border-gray-100 overflow-x-auto">
        <div className="flex gap-1 px-3 py-2 w-max min-w-full">
          {/* "All" tab */}
          <button
            onClick={() => setActiveGroup('ALL')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeGroup === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => {
            const count = allItems.filter(i => i.category?.id === cat.id).length
            const isActive = activeGroup === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveGroup(cat.id)}
                style={isActive ? { backgroundColor: cat.color ?? '#6366f1', borderColor: cat.color ?? '#6366f1' } : {}}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap border-2 ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
                }`}
              >
                {cat.icon && <span className="text-sm leading-none">{cat.icon}</span>}
                {cat.name}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Item grid area ──────────────────────────────────────────────────────────
  const ItemGrid = ({ cols }: { cols: string }) => (
    <div className="flex-1 overflow-y-auto p-2">
      {isLoadingItems ? (
        <div className={`grid ${cols} gap-2`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-200" />
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-400">
          <span className="text-5xl mb-3">📦</span>
          <p className="font-semibold text-sm">{q ? 'No items match' : 'No items in stock'}</p>
        </div>
      ) : (
        <div className={`grid ${cols} gap-2`}>
          {displayItems.map(item => <ItemTile key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {showHolds && <HoldsModal />}

      <div className="fixed inset-0 bg-gray-100 flex flex-col overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-700 text-white shrink-0">
          <span className="font-bold text-sm tracking-wide">PETROS POS</span>
          {currentBranch && <span className="text-indigo-200 text-xs truncate">· {currentBranch.name}</span>}
          <div className="flex-1" />

          {/* Hold order */}
          <button
            onClick={holdOrder}
            disabled={cart.length === 0}
            title="Hold order"
            className="p-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors text-xs font-bold"
          >
            ⏸ Hold
          </button>

          {/* Recall holds */}
          <button
            onClick={() => setShowHolds(true)}
            title="Held orders"
            className="relative p-1.5 rounded-lg hover:bg-indigo-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
            {holds.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 text-indigo-900 text-[9px] font-bold rounded-full flex items-center justify-center">
                {holds.length}
              </span>
            )}
          </button>

          {user?.name && <span className="text-indigo-200 text-xs hidden sm:inline">Cashier: {user.name}</span>}

          <button
            onClick={() => router.push('/sales')}
            title="Exit POS"
            className="p-1.5 rounded-lg hover:bg-indigo-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── DESKTOP layout (md+) ──────────────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden">

          {/* LEFT — search + grid */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <SearchBar />
            <CategoryTabs />
            <ItemGrid cols="grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" />
          </div>

          {/* RIGHT — cart + controls */}
          <div className="flex flex-col w-80 xl:w-96 bg-white border-l border-gray-200 shrink-0 overflow-hidden">

            {/* Customer */}
            <div className="px-3 pt-3 pb-1 border-b border-gray-100 shrink-0">
              <CustomerPanel />
            </div>

            {/* Cart header */}
            <div className="px-4 py-2 flex items-center justify-between shrink-0">
              <span className="font-bold text-gray-800 text-sm">
                Cart {cart.length > 0 && <span className="ml-1 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{cart.length}</span>}
              </span>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear</button>
              )}
            </div>

            {/* Cart lines */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-gray-300">
                  <span className="text-4xl mb-2">🛒</span>
                  <p className="text-sm">Cart is empty</p>
                </div>
              ) : (
                cart.map((line, idx) => <CartLineRow key={line.itemId} line={line} idx={idx} />)
              )}
            </div>

            {/* Numpad */}
            <div className="shrink-0 border-t border-gray-100">
              <Numpad />
            </div>

            {/* Payment */}
            <div className="shrink-0 border-t border-gray-100 overflow-y-auto max-h-72">
              <PaymentPanel />
            </div>
          </div>
        </div>

        {/* ── MOBILE layout (<md) ───────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden md:hidden">

          {/* Tab bar */}
          <div className="flex bg-white border-b border-gray-200 shrink-0">
            <button
              onClick={() => setMobileTab('items')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'items' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            >
              Items
            </button>
            <button
              onClick={() => setMobileTab('cart')}
              className={`flex-1 py-3 text-sm font-bold relative transition-colors ${mobileTab === 'cart' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            >
              Cart
              {cart.length > 0 && (
                <span className="absolute top-2 right-8 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
          </div>

          {/* Items tab */}
          {mobileTab === 'items' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <SearchBar compact />
              <CategoryTabs />
              <ItemGrid cols="grid-cols-3 sm:grid-cols-4" />
              {cart.length > 0 && (
                <div className="shrink-0 px-3 py-2 bg-white border-t border-gray-200 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
                    <p className="text-base font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
                  </div>
                  <button
                    onClick={() => setMobileTab('cart')}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm active:scale-95 transition-all"
                  >
                    View Cart →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cart / checkout tab */}
          {mobileTab === 'cart' && (
            <div className="flex flex-col flex-1 overflow-hidden bg-white">

              {/* Customer */}
              <div className="px-3 pt-3 pb-2 border-b border-gray-100 shrink-0">
                <CustomerPanel compact />
              </div>

              {/* Cart lines */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-gray-300">
                    <span className="text-5xl mb-2">🛒</span>
                    <p className="text-sm">Cart is empty</p>
                    <button
                      onClick={() => setMobileTab('items')}
                      className="mt-4 px-5 py-2 bg-indigo-50 text-indigo-600 font-semibold rounded-xl text-sm"
                    >
                      ← Browse Items
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 flex items-center justify-between bg-gray-50">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cart ({cart.length})</span>
                      <button onClick={clearCart} className="text-xs text-red-500 font-semibold">Clear all</button>
                    </div>
                    {cart.map((line, idx) => (
                      <CartLineRow key={line.itemId} line={line} idx={idx} mobile />
                    ))}
                  </>
                )}
              </div>

              {/* Checkout panel */}
              {cart.length > 0 && (
                <div className="shrink-0 border-t border-gray-200 overflow-y-auto max-h-[55vh]">
                  <Numpad />
                  <PaymentPanel mobile />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
