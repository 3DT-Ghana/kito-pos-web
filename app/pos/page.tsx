'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useBranch } from '@/lib/branch/BranchContext'
import { useRolePermissions, useTenant, useTenantFeatures } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils/format'
import { formatTaxLabel, summariseTaxBreakdown } from '@/lib/tax/summary'
import { OperationalBranchPrompt } from '@/components/branch/OperationalBranchPrompt'

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
  itemType: 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'
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
  lineDiscount: number    // discount value (amount or % depending on lineDiscountMode)
  lineDiscountMode: DiscountMode
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
const UNTRACKED_MAX_STOCK = 999999

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvedLineDiscount(line: CartLine): number {
  const gross = line.basePrice * line.qty
  if (line.lineDiscountMode === 'pct') {
    return Math.min(100, line.lineDiscount) / 100 * gross
  }
  return Math.min(line.lineDiscount, gross)
}

function lineTotal(line: CartLine) {
  return Math.max(0, line.basePrice * line.qty - resolvedLineDiscount(line))
}

function isStockTracked(item: Pick<PosItem, 'itemType'>) {
  return item.itemType === 'INVENTORY'
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
  const {
    assignedBranchId,
    branchesEnabled,
    currentBranch,
    currentBranchId,
    isLoading: isBranchLoading,
    setBranchId,
  } = useBranch()
  const { features } = useTenantFeatures()
  const { hasTenantPermission } = useRolePermissions()
  const { tenantId } = useTenant()

  // Company name for title bar
  const [companyName, setCompanyName] = useState('')
  useEffect(() => {
    if (!tenantId) return
    fetch(`/api/tenants/${tenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setCompanyName(d.name) })
  }, [tenantId])

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
  const [numpadTarget, setNumpadTarget] = useState<'tendered' | 'qty' | 'lineDiscount' | 'price'>('tendered')

  // Line-discount editing
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null)
  const [discountBuffer, setDiscountBuffer] = useState('')

  // Price override editing (desktop numpad)
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null)
  const [priceBuffer, setPriceBuffer] = useState('')

  // Mobile numpad drawer state
  type NumpadDrawerState = 'hidden' | 'drawer' | 'docked'
  const [numpadDrawer, setNumpadDrawer] = useState<NumpadDrawerState>('docked')

  // Approval PIN modal
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinDigits, setPinDigits] = useState('')
  const [pinError, setPinError] = useState('')
  const [isPinVerifying, setIsPinVerifying] = useState(false)

  // Holds
  const [holds, setHolds] = useState<HeldOrder[]>([])
  const [showHolds, setShowHolds] = useState(false)

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSaleData, setLastSaleData] = useState<null | {
    id: string; receiptNumber: string; date: string; time: string
    items: {
      name: string
      qty: number
      unitPrice: number
      lineTotal: number
      lineTaxAmount: number
    }[]
    subtotal: number
    taxAmount: number
    taxLines: {
      taxRateId: string | null
      taxName: string
      taxRatePercentage: number
      taxableAmount: number
      taxAmount: number
    }[]
    orderDiscount: number
    total: number
    paidAmount: number
    change: number
    method: PaymentMethod
    customerName: string; note: string
  }>(null)

  // UX
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [flashSuccess, setFlashSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [noticeMsg, setNoticeMsg] = useState('')
  const [mobileTab, setMobileTab] = useState<MobileTab>('items')
  const isAutoSelectingAssignedBranch =
    !isBranchLoading && branchesEnabled && !currentBranchId && Boolean(assignedBranchId)
  const requiresOperationalBranch =
    !isBranchLoading && branchesEnabled && !currentBranchId && !assignedBranchId

  useEffect(() => {
    if (isAutoSelectingAssignedBranch && assignedBranchId) {
      setBranchId(assignedBranchId)
    }
  }, [assignedBranchId, isAutoSelectingAssignedBranch, setBranchId])

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

  useEffect(() => { loadItems() }, [loadItems, currentBranchId])
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

  const groupFiltered = (activeGroup === 'ALL' || activeGroup === '__ALL_ITEMS__')
    ? allItems
    : allItems.filter(i => i.category?.id === activeGroup)

  const displayItems = q
    ? groupFiltered.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.startsWith(search.trim()))
      )
    : groupFiltered

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
    const maxStock = isStockTracked(item) ? item.quantity : UNTRACKED_MAX_STOCK
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
        maxStock,
        lineDiscount: 0,
        lineDiscountMode: 'pct' as DiscountMode,
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
    setCart(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const max = c.lineDiscountMode === 'pct' ? 100 : c.basePrice * c.qty
      return { ...c, lineDiscount: Math.max(0, Math.min(discount, max)) }
    }))
  }

  const setLineDiscountMode = (idx: number, mode: DiscountMode) => {
    setCart(prev => prev.map((c, i) =>
      i === idx ? { ...c, lineDiscountMode: mode, lineDiscount: 0 } : c
    ))
  }

  const setLinePrice = (idx: number, price: number) => {
    if (price <= 0) return
    setCart(prev => prev.map((c, i) =>
      i === idx ? { ...c, basePrice: price, lineDiscount: 0 } : c
    ))
  }

  const clearCart = () => { setCart([]); setSelectedCartIdx(null); setNote('') }

  const addAllToCart = (items: PosItem[]) => {
    items.forEach(item => addToCart(item))
  }

  // ── Barcode / keyboard search ───────────────────────────────────────────────

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const exact = allItems.find(i => i.barcode === search.trim())
      if (exact) { addToCart(exact); return }
      if (displayItems.length === 1) { addToCart(displayItems[0]); return }
    }
    if (e.key === 'Escape') {
      setSearch('')
      setActiveGroup('ALL')
      searchRef.current?.focus()
    }
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
    } else if (numpadTarget === 'price' && editingPriceIdx !== null) {
      let buf = priceBuffer
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') {
        setLinePrice(editingPriceIdx, parseFloat(buf) || 0)
        setPriceBuffer(''); setEditingPriceIdx(null); setNumpadTarget('tendered')
        return
      } else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setPriceBuffer(buf)
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

  // Returns true if the current cart has flags that require approval
  const cartNeedsApproval = () => {
    if (!features.requireApproval) return false
    const canSelf = hasTenantPermission(user?.role, 'approve_transactions')
    if (canSelf) return false
    const hasDiscount = cart.some(c => c.lineDiscount > 0) || orderDiscountNum > 0
    const hasPriceOverride = cart.some(c => c.basePrice < c.tiers.sellingPrice - 0.001)
    const isCredit = (grandTotal - (tenderedNum > 0 ? Math.min(tenderedNum, grandTotal) : grandTotal)) > 0.001
    return hasDiscount || hasPriceOverride || isCredit
  }

  const handleCheckout = async (approvalGrant?: string) => {
    if (cart.length === 0 || isSubmitting) return
    setErrorMsg('')
    setNoticeMsg('')
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
            discountAmount: resolvedLineDiscount(c) + (orderDiscountNum > 0 && cartSubtotal > 0
              ? orderDiscountNum * (lineTotal(c) / cartSubtotal)  // prorate order discount
              : 0),
          })),
          paidAmount,
          paymentMethod: method,
          note,
          ...(approvalGrant ? { approvalGrant } : {}),
        }),
      })

      const result = await res.json()

      if (res.status === 202 && result.requiresApproval) {
        setNoticeMsg(result.message ?? 'This sale was submitted for approval and is waiting for a manager.')
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
        return
      }

      if (!res.ok) {
        const err = result
        throw new Error(err.error || 'Failed to record sale')
      }

      const saleTaxBreakdown = summariseTaxBreakdown(result.taxLines ?? [])

      const now = new Date()
      setLastSaleData({
        id: result.id ?? result.data?.id ?? '',
        receiptNumber: result.id?.slice(0, 8).toUpperCase() ?? '—',
        date: now.toLocaleDateString('en-GH'),
        time: now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }),
        items: (result.items ?? []).map((line: {
          quantity: number
          price: number
          lineTotalAmount?: number
          lineTaxAmount?: number
          item?: { name: string }
        }) => ({
          name: line.item?.name ?? 'Item',
          qty: line.quantity,
          unitPrice: line.price,
          lineTotal: line.lineTotalAmount ?? line.price * line.quantity,
          lineTaxAmount: line.lineTaxAmount ?? 0,
        })),
        subtotal: result.subtotalAmount ?? cartSubtotal,
        taxAmount: result.taxAmount ?? 0,
        taxLines: saleTaxBreakdown,
        orderDiscount: orderDiscountNum,
        total: result.totalAmount ?? grandTotal,
        paidAmount: result.paidAmount ?? paidAmount,
        change:
          (result.paymentMethod ?? method) === 'CASH' &&
          tenderedNum > (result.totalAmount ?? grandTotal)
            ? tenderedNum - (result.totalAmount ?? grandTotal)
            : 0,
        method: result.paymentMethod ?? method,
        customerName: result.customer?.name ?? selectedCustomer?.name ?? '',
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
                    <div className="text-xs text-gray-500">
                      {line.qty} × {formatCurrency(line.unitPrice)}
                      {line.lineTaxAmount > 0 ? ` · Tax ${formatCurrency(line.lineTaxAmount)}` : ''}
                    </div>
                  </div>
                  <div className="font-semibold shrink-0">{formatCurrency(line.lineTotal)}</div>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(lastSaleData.subtotal)}</span></div>
              {lastSaleData.orderDiscount > 0 && (
                <div className="flex justify-between text-green-700"><span>Discount</span><span>− {formatCurrency(lastSaleData.orderDiscount)}</span></div>
              )}
              {lastSaleData.taxLines.map((taxLine) => (
                <div
                  key={`${taxLine.taxRateId ?? taxLine.taxName}-${taxLine.taxRatePercentage}`}
                  className="flex justify-between text-gray-600"
                >
                  <span>{formatTaxLabel(taxLine)}</span>
                  <span>{formatCurrency(taxLine.taxAmount)}</span>
                </div>
              ))}
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
  // mobile prop: when true renders the drawer control bar (show/hide/dock)
  const Numpad = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="bg-white">
      {/* Mobile drawer control bar */}
      {mobile && (
        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-100">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {numpadTarget === 'qty'
              ? `Qty${numpadBuffer ? ` → ${numpadBuffer}` : ''}`
              : numpadTarget === 'price'
              ? `Price${priceBuffer ? ` → ${priceBuffer}` : ''}`
              : numpadTarget === 'lineDiscount'
              ? `Discount${discountBuffer ? ` → ${discountBuffer}` : ''}`
              : 'Numpad'}
          </span>
          <div className="flex items-center gap-1">
            {/* Dock toggle */}
            <button
              onClick={() => setNumpadDrawer(numpadDrawer === 'docked' ? 'drawer' : 'docked')}
              title={numpadDrawer === 'docked' ? 'Make drawer' : 'Dock numpad'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                numpadDrawer === 'docked'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {numpadDrawer === 'docked' ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                  Drawer
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  Dock
                </>
              )}
            </button>
            {/* Hide button */}
            <button
              onClick={() => setNumpadDrawer('hidden')}
              title="Hide numpad"
              className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        {/* Context label — desktop only (mobile shows it in the bar above) */}
        {!mobile && numpadTarget !== 'tendered' && (
          <div className="mb-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
            {numpadTarget === 'qty'
              ? `Setting qty${numpadBuffer ? ` → ${numpadBuffer}` : ''}`
              : numpadTarget === 'price'
              ? `Override price${priceBuffer ? ` → ${priceBuffer}` : ''}`
              : `Setting discount${discountBuffer ? ` → ${discountBuffer}` : ''}`}
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
    </div>
  )

  // ── Cart line row (shared between mobile and desktop) ───────────────────────
  const canEditPrice =
    user?.role === 'OWNER' ||
    user?.role === 'STORE_MANAGER' ||
    user?.role === 'BRANCH_MANAGER'

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
          {/* Name */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedCartIdx(isSelected ? null : idx)}>
            <p className="text-sm font-semibold text-gray-900 truncate">{line.name}</p>
            {/* Price — tappable to edit if permitted */}
            {canEditPrice ? (
              mobile ? (
                <input
                  type="number"
                  inputMode="decimal"
                  value={line.basePrice}
                  onChange={e => setLinePrice(idx, parseFloat(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  className="w-20 text-xs font-bold text-indigo-600 bg-transparent border-b border-indigo-300 focus:outline-none focus:border-indigo-500"
                />
              ) : (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setEditingPriceIdx(idx)
                    setPriceBuffer(String(line.basePrice))
                    setNumpadTarget('price')
                    setSelectedCartIdx(idx)
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                  title="Edit price"
                >
                  {formatCurrency(line.basePrice)} ✎
                </button>
              )
            ) : (
              <p className="text-xs text-gray-400">
                {formatCurrency(line.basePrice)}
              </p>
            )}
            {line.lineDiscount > 0 && (
              <p className="text-xs text-green-600">
                − {line.lineDiscountMode === 'pct' ? `${line.lineDiscount}%` : formatCurrency(line.lineDiscount)} disc.
              </p>
            )}
          </div>
          {/* Qty controls — inline +/− on both mobile and desktop */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => updateQty(idx, line.qty - 1)}
              className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation hover:bg-red-100 hover:text-red-600 transition-colors"
            >−</button>
            <button
              onClick={() => { setSelectedCartIdx(isSelected ? null : idx); setNumpadTarget('qty'); setNumpadBuffer(String(line.qty)) }}
              className="w-8 h-7 rounded-lg bg-gray-50 border border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
              title="Tap to set qty via numpad"
            >
              {line.qty}
            </button>
            <button
              onClick={() => updateQty(idx, line.qty + 1)}
              className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation hover:bg-green-100 hover:text-green-700 transition-colors"
            >+</button>
          </div>
          {/* Line total */}
          <p className="text-sm font-bold text-gray-900 w-16 text-right shrink-0">{formatCurrency(lineTotal(line))}</p>
          {/* Remove */}
          <button onClick={() => removeFromCart(idx)} className="text-red-300 hover:text-red-500 text-xl leading-none shrink-0">×</button>
        </div>

        {/* Expanded controls when selected */}
        {isSelected && (
          <div className="mt-2 space-y-2">
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Line disc.:</span>
                {/* Mode toggle */}
                <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setLineDiscountMode(idx, 'pct')}
                    className={`px-2 py-1 text-xs font-bold transition-colors ${line.lineDiscountMode === 'pct' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >%</button>
                  <button
                    onClick={() => setLineDiscountMode(idx, 'fixed')}
                    className={`px-2 py-1 text-xs font-bold transition-colors ${line.lineDiscountMode === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >GHS</button>
                </div>
                {mobile ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={line.lineDiscount || ''}
                    onChange={e => setLineDiscount(idx, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    max={line.lineDiscountMode === 'pct' ? 100 : line.basePrice * line.qty}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold focus:border-indigo-400 focus:outline-none"
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
                    {line.lineDiscount > 0
                      ? line.lineDiscountMode === 'pct'
                        ? `− ${line.lineDiscount}% (${formatCurrency(resolvedLineDiscount(line))})`
                        : `− ${formatCurrency(line.lineDiscount)}`
                      : 'Add discount'}
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
          {formatCurrency(Math.abs(change))} will be added to {selectedCustomer.name}&apos;s balance
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
      {noticeMsg && (
        <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded-xl mb-2">{noticeMsg}</p>
      )}

      <button
        onClick={() => {
          if (cartNeedsApproval()) {
            setPinDigits('')
            setPinError('')
            setShowPinModal(true)
          } else {
            handleCheckout()
          }
        }}
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
    const stockTracked = isStockTracked(item)
    const isLow = stockTracked && item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD
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
          {!stockTracked
            ? 'No stock tracking'
            : isLow
              ? `⚠ ${item.quantity} left`
              : `Stk: ${item.quantity}`}
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

  // ── Category picker grid — shown when no category selected and no search ────
  const CategoryPicker = ({ cols }: { cols: string }) => (
    <div className="flex-1 overflow-y-auto p-3">
      {isLoadingItems ? (
        <div className={`grid ${cols} gap-3`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-gray-200" />
          ))}
        </div>
      ) : (
        <div className={`grid ${cols} gap-3`}>
          {categories.map(cat => {
            const count = allItems.filter(i => i.category?.id === cat.id).length
            return (
              <button
                key={cat.id}
                onClick={() => setActiveGroup(cat.id)}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-transparent bg-white hover:shadow-md active:scale-95 touch-manipulation transition-all"
                style={{ borderColor: (cat.color ?? '#6366f1') + '44' }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm"
                  style={{ backgroundColor: (cat.color ?? '#6366f1') + '20' }}
                >
                  {cat.icon ?? '📦'}
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{cat.name}</p>
                  <p className="text-[10px] font-semibold mt-0.5" style={{ color: cat.color ?? '#6366f1' }}>
                    {count} item{count !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            )
          })}
          {/* All items tile */}
          <button
            onClick={() => setActiveGroup('__ALL_ITEMS__')}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:shadow-md active:scale-95 touch-manipulation transition-all hover:border-indigo-300"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl bg-gray-100">
              🏪
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-gray-800">All Items</p>
              <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{allItems.length} items</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )

  // ── Item grid area ──────────────────────────────────────────────────────────
  const ItemGrid = ({ cols }: { cols: string }) => {
    const activeCat = (activeGroup !== 'ALL' && activeGroup !== '__ALL_ITEMS__')
      ? categories.find(c => c.id === activeGroup)
      : null
    return (
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Back + category header + Add All */}
        <div
          className="shrink-0 flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100"
          style={activeCat ? { borderLeftWidth: 3, borderLeftColor: activeCat.color ?? '#6366f1' } : {}}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveGroup('ALL')}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 active:scale-95 touch-manipulation"
            >
              ← Categories
            </button>
            {activeCat && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-lg leading-none">{activeCat.icon}</span>
                <span className="text-xs font-bold text-gray-700">{activeCat.name}</span>
                <span className="text-[10px] text-gray-400 font-semibold">({displayItems.length})</span>
              </>
            )}
            {!activeCat && (
              <span className="text-xs font-bold text-gray-700">All Items <span className="text-gray-400 font-normal">({displayItems.length})</span></span>
            )}
          </div>
          {activeCat && displayItems.length > 0 && (
            <button
              onClick={() => addAllToCart(displayItems)}
              style={{ backgroundColor: activeCat.color ?? '#6366f1' }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white active:scale-95 touch-manipulation transition-transform"
            >
              + Add All
            </button>
          )}
        </div>
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
              <p className="font-semibold text-sm">{q ? 'No items match' : 'No items in this category'}</p>
            </div>
          ) : (
            <div className={`grid ${cols} gap-2`}>
              {displayItems.map(item => <ItemTile key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // show category picker when: no search, no category chosen yet, and categories exist
  const showCategoryPicker = !q && activeGroup === 'ALL' && categories.length > 0

  // ────────────────────────────────────────────────────────────────────────────

  // ── PIN Approval Modal ──────────────────────────────────────────────────────
  const PIN_LENGTH = 6

  const handlePinKey = (key: string) => {
    if (isPinVerifying) return
    if (key === 'backspace') {
      setPinDigits(d => d.slice(0, -1))
      setPinError('')
      return
    }
    if (pinDigits.length >= PIN_LENGTH) return
    const next = pinDigits + key
    setPinDigits(next)
    setPinError('')
    if (next.length === PIN_LENGTH) {
      submitPin(next)
    }
  }

  const submitPin = async (pin: string) => {
    if (pin.length < 4 || isPinVerifying) return
    setIsPinVerifying(true)
    setPinError('')
    try {
      const res = await fetch('/api/approvals/pin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.valid) {
        setShowPinModal(false)
        setPinDigits('')
        handleCheckout(data.grant)
      } else {
        setPinError(data.error ?? 'Invalid PIN')
        setPinDigits('')
      }
    } catch {
      setPinError('Verification failed. Please try again.')
      setPinDigits('')
    } finally {
      setIsPinVerifying(false)
    }
  }

  const PinModal = () => {
    const numpadKeys = ['1','2','3','4','5','6','7','8','9','','0','backspace']
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-2xl shrink-0">🔐</div>
            <div>
              <p className="font-bold text-gray-900">Manager Approval Required</p>
              <p className="text-xs text-gray-500">Enter a manager&apos;s approval PIN to proceed.</p>
            </div>
          </div>

          {/* PIN dots */}
          <div className="px-5 pt-5 pb-2">
            <div className="flex justify-center gap-3 mb-1">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-colors ${
                    i < pinDigits.length ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                  }`}
                />
              ))}
            </div>
            {pinError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2 text-center">{pinError}</p>
            )}
          </div>

          {/* Numpad */}
          <div className="px-4 pb-2 grid grid-cols-3 gap-2">
            {numpadKeys.map((key, idx) => {
              if (key === '') {
                return <div key={idx} />
              }
              if (key === 'backspace') {
                return (
                  <button
                    key={key}
                    onClick={() => handlePinKey('backspace')}
                    disabled={isPinVerifying}
                    className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition-all disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6H6a2 2 0 00-2 2v8a2 2 0 002 2h6l6-6-6-6z" />
                    </svg>
                  </button>
                )
              }
              return (
                <button
                  key={key}
                  onClick={() => handlePinKey(key)}
                  disabled={isPinVerifying || pinDigits.length >= PIN_LENGTH}
                  className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-xl font-semibold text-gray-800 transition-all disabled:opacity-40"
                >
                  {key}
                </button>
              )
            })}
          </div>

          {/* Actions */}
          <div className="px-4 pb-5 flex gap-2 mt-1">
            <button
              onClick={() => submitPin(pinDigits)}
              disabled={isPinVerifying || pinDigits.length < 4}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
            >
              {isPinVerifying ? 'Verifying…' : 'Approve'}
            </button>
            <button
              onClick={() => { setShowPinModal(false); setPinDigits(''); setPinError('') }}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (requiresOperationalBranch) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
        <OperationalBranchPrompt
          title="Choose a branch before opening the POS terminal"
          description="The POS terminal sells from one branch at a time. Select the branch you are serving from to load the right stock and continue."
        />
      </div>
    )
  }

  if (isBranchLoading || isAutoSelectingAssignedBranch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 text-sm text-gray-500">
        Loading branch selection...
      </div>
    )
  }

  return (
    <>
      {showHolds && <HoldsModal />}
      {showPinModal && <PinModal />}

      <div className="fixed inset-0 bg-gray-100 flex flex-col overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-700 text-white shrink-0">
          <span className="font-bold text-sm tracking-wide">{companyName || 'POS Terminal'}</span>
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

          {/* LEFT — search + category picker or item grid */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <SearchBar />
            {showCategoryPicker
              ? <CategoryPicker cols="grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" />
              : <ItemGrid cols="grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" />
            }
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
              {showCategoryPicker
                ? <CategoryPicker cols="grid-cols-3 sm:grid-cols-4" />
                : <ItemGrid cols="grid-cols-3 sm:grid-cols-4" />
              }
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
            <div className="relative flex flex-col flex-1 overflow-hidden bg-white">

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

              {/* Checkout panel — payment always docked at bottom */}
              {cart.length > 0 && (
                <div className="shrink-0 border-t border-gray-200 overflow-y-auto max-h-[55vh]">
                  {/* Docked numpad — sits inline above payment panel */}
                  {numpadDrawer === 'docked' && (
                    <div className="border-b border-gray-100">
                      <Numpad mobile />
                    </div>
                  )}
                  <PaymentPanel mobile />
                </div>
              )}

              {/* Floating "show numpad" button — only when numpad is hidden and cart has items */}
              {cart.length > 0 && numpadDrawer === 'hidden' && (
                <button
                  onClick={() => setNumpadDrawer('drawer')}
                  className="absolute bottom-24 right-4 z-30 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-lg font-bold active:scale-95 touch-manipulation"
                  title="Open numpad"
                >
                  123
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Mobile numpad drawer — floats over content when in 'drawer' mode ── */}
        {numpadDrawer === 'drawer' && mobileTab === 'cart' && cart.length > 0 && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              onClick={() => setNumpadDrawer('hidden')}
            />
            {/* Bottom sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-2xl shadow-2xl overflow-hidden">
              {/* Drag handle */}
              <div className="flex justify-center bg-white pt-2 pb-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              <Numpad mobile />
            </div>
          </>
        )}
      </div>
    </>
  )
}
