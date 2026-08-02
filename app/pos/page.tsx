'use client'

import { useEffect, useRef, useState, useCallback, RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useUser } from '@/hooks/useUser'
import { useBranch } from '@/lib/branch/BranchContext'
import { useRolePermissions, useTenant, useTenantFeatures } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils/format'
import { formatTaxLabel, summariseTaxBreakdown } from '@/lib/tax/summary'
import { OperationalBranchPrompt } from '@/components/branch/OperationalBranchPrompt'
import { useCustomerDisplaySender } from '@/hooks/useCustomerDisplay'
import { isLowStock } from '@/lib/items/stock'
import { MomoPhoneModal } from '@/components/modals/MomoPhoneModal'

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
  reorderLevel: number
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

interface SearchBarProps {
  searchRef: RefObject<HTMLInputElement | null>
  search: string
  setSearch: (v: string) => void
  setActiveGroup: (v: string) => void
  handleSearchKey: React.KeyboardEventHandler<HTMLInputElement>
  features: { enableRetailPrice: boolean; enableWholesalePrice: boolean; enablePromoPrice: boolean }
  globalTier: PriceTier
  setGlobalTier: (v: PriceTier) => void
  compact?: boolean
}

function SearchBar({
  searchRef, search, setSearch, setActiveGroup, handleSearchKey,
  features, globalTier, setGlobalTier, compact = false,
}: SearchBarProps) {
  return (
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
          className={`w-full pl-9 pr-4 border-2 border-indigo-300 focus:border-indigo-500 focus:outline-none font-medium ${compact ? 'py-2 text-sm' : 'py-2.5 text-sm'}`}
          autoComplete="off"
        />
      </div>
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
              className={`px-2.5 py-1 text-xs font-bold border-2 transition-colors ${
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
}

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
  useRolePermissions()
  const { tenantName } = useTenant()

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
  const [momoPhone, setMomoPhone] = useState('')
  const [tendered, setTendered] = useState('')        // cash tendered
  const [momoPaid, setMomoPaid] = useState('')        // momo amount in split
  const [cashPaid, setCashPaid] = useState('')        // cash amount in split
  const [splitMode, setSplitMode] = useState(false)   // cash + momo split
  const [, setMomoTxId] = useState<string | null>(null)
  const [momoStatus, setMomoStatus] = useState<'idle' | 'sending' | 'pending' | 'success' | 'failed'>('idle')
  const [momoPhoneModalOpen, setMomoPhoneModalOpen] = useState(false)
  const [numpadBuffer, setNumpadBuffer] = useState('')
  const [numpadTarget, setNumpadTarget] = useState<'tendered' | 'momoPaid' | 'cashPaid' | 'qty' | 'lineDiscount' | 'price'>('tendered')

  // Line-discount editing
  const [editingDiscountIdx, setEditingDiscountIdx] = useState<number | null>(null)
  const [discountBuffer, setDiscountBuffer] = useState('')

  // Price override editing (desktop numpad)
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null)
  const [priceBuffer, setPriceBuffer] = useState('')

  // Numpad drawer — shared across desktop and mobile
  const [showNumpadDrawer, setShowNumpadDrawer] = useState(false)
  // kept for mobile legacy usage
  type NumpadDrawerState = 'hidden' | 'drawer' | 'docked'
  const [numpadDrawer, setNumpadDrawer] = useState<NumpadDrawerState>('docked')

  // Approval PIN modal
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinDigits, setPinDigits] = useState('')
  const [pinError, setPinError] = useState('')
  const [isPinVerifying, setIsPinVerifying] = useState(false)
  // Pending approval state — sale submitted, waiting for PIN or manager to approve
  const [pendingApprovalSaleId, setPendingApprovalSaleId] = useState<string | null>(null)
  const [isPollingApproval, setIsPollingApproval] = useState(false)

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
  const [showSessionMenu, setShowSessionMenu] = useState(false)
  const sessionMenuRef = useRef<HTMLDivElement>(null)
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
  useEffect(() => {
    if (!showSessionMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(event.target as Node)) {
        setShowSessionMenu(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [showSessionMenu])

  // ── Barcode scanner state ────────────────────────────────────────────────────
  const [lastScannedItemId, setLastScannedItemId] = useState<string | null>(null)
  const [scanError, setScanError]                 = useState<string>('')
  const cartEndRef = useRef<HTMLDivElement>(null)

  // Stable refs so the scanner effect reads fresh data without re-registering.
  const allItemsRef = useRef(allItems)
  useEffect(() => { allItemsRef.current = allItems }, [allItems])

  // ── Global barcode scanner capture ──────────────────────────────────────────
  // Industry POS scanner flow:
  //   1. Cashier scans → item added/incremented instantly, NO search interaction
  //   2. Repeated scans of same barcode increment qty
  //   3. Scanned line highlighted; numpad auto-targets its qty
  //   4. Manual search still works for keyboard lookup
  //
  // Detection: scanners emit all chars + Enter in < 50ms per char total.
  // We buffer ALL keydown events. On Enter, if chars arrived fast → scanner.
  // If chars arrived slowly (human typing in the search box) → ignore buffer,
  // let the search input's own onChange + handleSearchKey handle it.
  useEffect(() => {
    let scanBuffer   = ''
    let lastKeyTime  = 0
    let scanTimer: ReturnType<typeof setTimeout> | null = null

    const handleGlobalKey = (e: KeyboardEvent) => {
      const now    = Date.now()
      const target = e.target as HTMLElement
      const tag    = target.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'Enter') {
        // A scanner fires Enter right after the last char — gap < 50ms.
        // Human pressing Enter in search box has gap >> 50ms.
        const isScan = scanBuffer.length >= 3 && (now - lastKeyTime) < 80
        if (isScan) {
          e.preventDefault()
          const code = scanBuffer.trim()
          scanBuffer = ''
          if (scanTimer) { clearTimeout(scanTimer); scanTimer = null }

          const item = allItemsRef.current.find(i => i.barcode === code)
          if (item) {
            setScanError('')
            addToCartRef.current(item)             // increments qty if already in cart
            setLastScannedItemId(item.id)
            // Flash highlight for 1.5 s then clear
            setTimeout(() => setLastScannedItemId(null), 1500)
            // Scroll cart to bottom so newly added line is visible
            setTimeout(() => cartEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
          } else {
            setScanError(`Barcode not found: ${code}`)
            setTimeout(() => setScanError(''), 3000)
          }
          // Keep search box clean — scanner result never contaminates search
          setSearch('')
        }
        scanBuffer = ''
        return
      }

      // Ignore modifier / function keys
      if (e.key.length > 1) return

      lastKeyTime  = now
      scanBuffer  += e.key

      // If not in a text field, redirect keystrokes to search so manual typing works
      if (!inInput) {
        setSearch(prev => prev + e.key)
        setActiveGroup('ALL')
        searchRef.current?.focus()
        e.preventDefault()
      }

      // Reset buffer if no Enter within 300 ms
      if (scanTimer) clearTimeout(scanTimer)
      scanTimer = setTimeout(() => { scanBuffer = '' }, 300)
    }

    document.addEventListener('keydown', handleGlobalKey)
    return () => {
      document.removeEventListener('keydown', handleGlobalKey)
      if (scanTimer) clearTimeout(scanTimer)
    }
  }, []) // stable — registers once

  // ── Customer search ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/pos/customers?q=${encodeURIComponent(customerQuery)}&limit=8`)
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
        (i.barcode && i.barcode.toLowerCase().includes(q))
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
  const momoPaidNum = parseFloat(momoPaid) || 0
  const cashPaidNum = parseFloat(cashPaid) || 0
  const change = tenderedNum - grandTotal
  // Split mode totals
  const splitTotal = momoPaidNum + cashPaidNum
  const splitReady = splitMode
    ? Math.abs(splitTotal - grandTotal) < 0.001 && momoPaidNum > 0
    : false
  // Whether charge button should be enabled
  const paymentComplete = (() => {
    if (cart.length === 0) return false
    if (splitMode) return splitReady && momoPhone.trim().length >= 9
    if (method === 'CASH') return features.enableCreditSales ? tenderedNum > 0 : tenderedNum >= grandTotal
    if (method === 'MOMO') return momoPhone.trim().length >= 9
    return true // BANK
  })()

  // ── Cart helpers ────────────────────────────────────────────────────────────

  function resolvePrice(item: PosItem, tier: PriceTier): number {
    return (item[tier] as number | null) ?? item.sellingPrice
  }

  const addToCart = useCallback((item: PosItem) => {
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
  }, [globalTier])

  // Stable ref so the scanner effect always calls the latest addToCart without re-registering.
  const addToCartRef = useRef(addToCart)
  useEffect(() => { addToCartRef.current = addToCart }, [addToCart])

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

  const clearCart = () => {
    setCart([]); setSelectedCartIdx(null); setNote('')
    setMomoPaid(''); setCashPaid(''); setSplitMode(false)
    setMomoTxId(null); setMomoStatus('idle'); setMomoPhone('')
  }

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
        setShowNumpadDrawer(false)
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
        setShowNumpadDrawer(false)
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
        setShowNumpadDrawer(false)
        return
      } else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setPriceBuffer(buf)
    } else if (numpadTarget === 'momoPaid') {
      let buf = momoPaid
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') { setNumpadTarget('cashPaid'); return }
      else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setMomoPaid(buf)
    } else if (numpadTarget === 'cashPaid') {
      let buf = cashPaid
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') { setShowNumpadDrawer(false); return }
      else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setCashPaid(buf)
    } else {
      let buf = tendered
      if (key === '←') buf = buf.slice(0, -1)
      else if (key === 'C') buf = ''
      else if (key === '✓') {
        setShowNumpadDrawer(false)
        return
      }
      else if (key === '.' && buf.includes('.')) { /* skip */ }
      else buf = buf + key
      setTendered(buf)
    }
  }

  // ── MoMo collect via Hubtel ─────────────────────────────────────────────────
  const sendMomoRequest = async (amountToCharge: number, phone: string, ref: string) => {
    setMomoStatus('sending')
    setMomoTxId(null)
    const res = await fetch('/api/momo/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountToCharge,
        phoneNumber: phone,
        description: `Payment of GHS ${amountToCharge.toFixed(2)}`,
        clientReference: ref,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.transactionId) {
      setMomoStatus('failed')
      setErrorMsg(data.error || 'Failed to send MoMo request')
      return null
    }
    setMomoTxId(data.transactionId)
    setMomoStatus('pending')
    return data.transactionId as string
  }

  const pollMomoStatus = (txId: string, onSuccess: () => void, onFail: () => void) => {
    let attempts = 0
    const max = 24 // 2 minutes at 5s intervals
    const interval = setInterval(async () => {
      attempts++
      const res = await fetch(`/api/momo/status?transactionId=${encodeURIComponent(txId)}`)
      const data = await res.json()
      if (data.status === 'success') {
        clearInterval(interval)
        setMomoStatus('success')
        onSuccess()
      } else if (data.status === 'failed' || attempts >= max) {
        clearInterval(interval)
        setMomoStatus('failed')
        onFail()
      }
    }, 5000)
    return () => clearInterval(interval)
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

  // Called once a sale is confirmed approved (via PIN grant or manager page polling)
  const onSaleApproved = (total: number, saleId: string) => {
    const now = new Date()
    setLastSaleData(prev => prev ?? {
      id: saleId,
      receiptNumber: saleId.slice(0, 8).toUpperCase(),
      date: now.toLocaleDateString('en-GH'),
      time: now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }),
      items: cart.map(c => ({
        name: c.name,
        qty: c.qty,
        unitPrice: c.basePrice,
        lineTotal: lineTotal(c),
        lineTaxAmount: 0,
      })),
      subtotal: cartSubtotal,
      taxAmount: 0,
      taxLines: [],
      orderDiscount: orderDiscountNum,
      total,
      paidAmount: total,
      change: 0,
      method,
      customerName: selectedCustomer?.name ?? '',
      note,
    })
    setFlashSuccess(true)
    setPendingApprovalSaleId(null)
    setIsPollingApproval(false)
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
  }

  const buildSaleBody = () => {
    let paidAmount: number
    let paymentMethod: PaymentMethod
    if (splitMode) {
      paidAmount = grandTotal
      paymentMethod = 'CASH' // sale recorded as CASH; MoMo portion is pre-collected
    } else if (method === 'CASH') {
      paidAmount = tenderedNum > 0 ? Math.min(tenderedNum, grandTotal) : grandTotal
      paymentMethod = 'CASH'
    } else {
      paidAmount = grandTotal
      paymentMethod = method
    }
    return {
      customerId: selectedCustomer?.id ?? null,
      items: cart.map(c => ({
        itemId: c.itemId,
        quantity: c.qty,
        price: c.basePrice,
        discountAmount: resolvedLineDiscount(c) + (orderDiscountNum > 0 && cartSubtotal > 0
          ? orderDiscountNum * (lineTotal(c) / cartSubtotal)
          : 0),
      })),
      paidAmount,
      paymentMethod,
      momoPhone: method === 'MOMO' && !splitMode ? momoPhone.trim() || undefined : undefined,
      note,
    }
  }

  const finaliseSaleResult = (result: Record<string, unknown>, paidAmount: number) => {
    const saleTaxBreakdown = summariseTaxBreakdown((result.taxLines ?? []) as Parameters<typeof summariseTaxBreakdown>[0])
    const now = new Date()
    setLastSaleData({
      id: (result.id ?? result.data as { id?: string } | null ?? '') as string,
      receiptNumber: ((result.id as string | undefined)?.slice(0, 8).toUpperCase()) ?? '—',
      date: now.toLocaleDateString('en-GH'),
      time: now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }),
      items: ((result.items ?? []) as { quantity: number; price: number; lineTotalAmount?: number; lineTaxAmount?: number; item?: { name: string } }[]).map(line => ({
        name: line.item?.name ?? 'Item',
        qty: line.quantity,
        unitPrice: line.price,
        lineTotal: line.lineTotalAmount ?? line.price * line.quantity,
        lineTaxAmount: line.lineTaxAmount ?? 0,
      })),
      subtotal: (result.subtotalAmount as number | undefined) ?? cartSubtotal,
      taxAmount: (result.taxAmount as number | undefined) ?? 0,
      taxLines: saleTaxBreakdown,
      orderDiscount: orderDiscountNum,
      total: (result.totalAmount as number | undefined) ?? grandTotal,
      paidAmount: (result.paidAmount as number | undefined) ?? paidAmount,
      change:
        !splitMode &&
        ((result.paymentMethod ?? method) as string) === 'CASH' &&
        tenderedNum > ((result.totalAmount as number | undefined) ?? grandTotal)
          ? tenderedNum - ((result.totalAmount as number | undefined) ?? grandTotal)
          : 0,
      method: (result.paymentMethod as PaymentMethod | undefined) ?? method,
      customerName: (result as { customer?: { name?: string } }).customer?.name ?? selectedCustomer?.name ?? '',
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
  }

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return

    // Validate MoMo payment before proceeding
    if ((method === 'MOMO' || (splitMode && momoPaidNum > 0)) && !momoPhone.trim()) {
      setErrorMsg('Please enter the MoMo phone number before charging.')
      return
    }

    // For split / pure-MOMO: send MoMo request first and wait for approval
    const momoAmount = splitMode ? momoPaidNum : method === 'MOMO' ? grandTotal : 0
    if (momoAmount > 0 && momoStatus !== 'success') {
      if (momoStatus === 'pending') {
        setErrorMsg('Waiting for customer to approve MoMo payment.')
        return
      }
      const saleRef = `POS-${Date.now()}`
      const txId = await sendMomoRequest(momoAmount, momoPhone.trim(), saleRef)
      if (!txId) return // error already set by sendMomoRequest
      // Poll and complete checkout on success
      pollMomoStatus(
        txId,
        () => void completeCheckout(),
        () => setErrorMsg('MoMo payment was declined or timed out. Please try again.'),
      )
      return
    }

    await completeCheckout()
  }

  const completeCheckout = async () => {
    setErrorMsg('')
    setNoticeMsg('')
    setIsSubmitting(true)
    try {
      const body = buildSaleBody()
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (res.status === 202 && result.requiresApproval) {
        setPendingApprovalSaleId(result.saleId)
        setPinDigits('')
        setPinError('')
        setShowPinModal(true)
        setIsPollingApproval(true)
        return
      }

      if (!res.ok) {
        throw new Error(result.error || 'Failed to record sale')
      }

      finaliseSaleResult(result, body.paidAmount)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Poll for manager-side approval while PIN modal is open
  useEffect(() => {
    if (!isPollingApproval || !pendingApprovalSaleId || !showPinModal) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sales/${pendingApprovalSaleId}`)
        if (!res.ok) return
        const sale = await res.json()
        if (sale.approvalStatus === 'APPROVED') {
          setShowPinModal(false)
          setPinDigits('')
          onSaleApproved(sale.totalAmount, sale.id)
        } else if (sale.approvalStatus === 'REJECTED') {
          setShowPinModal(false)
          setPinDigits('')
          setPendingApprovalSaleId(null)
          setIsPollingApproval(false)
          setErrorMsg('Sale was rejected by the manager.')
        }
      } catch { /* ignore network hiccups */ }
    }, 3000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollingApproval, pendingApprovalSaleId, showPinModal])

  // ── Customer display (second screen) ────────────────────────────────────────
  useCustomerDisplaySender({
    cart,
    grandTotal,
    orderDiscountNum,
    selectedCustomer,
    method,
    flashSuccess,
    lastSaleData: lastSaleData
      ? { total: lastSaleData.total, change: lastSaleData.change, method: lastSaleData.method, customerName: lastSaleData.customerName }
      : null,
  })

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
  const handleLogout = async () => {
    setShowSessionMenu(false)
    await signOut({ callbackUrl: '/auth/login' })
  }

  const handleExitPos = () => {
    setShowSessionMenu(false)
    router.push('/sales')
  }

  if (showReceipt && lastSaleData) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
            <span className="font-bold text-gray-800">Receipt #{lastSaleData.receiptNumber}</span>
            <button onClick={() => setShowReceipt(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="p-4 space-y-3 font-mono text-sm max-h-[70vh] overflow-y-auto">
            <div className="text-center border-b pb-3">
              <div className="font-bold text-base">{currentBranch?.name ?? 'Sales Receipt'}</div>
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
            <div className="text-center border-t border-dashed border-gray-200 pt-2 mt-1" style={{ fontSize: '10px', color: '#aaa' }}>
              System Developed EYO Solutions | 0246462398
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => window.open(`/sales/${lastSaleData.id}`, '_blank')}
              className="flex-1 py-2.5 bg-indigo-600 text-white font-bold text-sm"
            >
              Print Receipt
            </button>
            <button
              onClick={() => setShowReceipt(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold text-sm"
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
      <div className="bg-white  sm:shadow-2xl w-full sm:max-w-md overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b">
          <span className="font-bold text-gray-800">Held Orders ({holds.length})</span>
          <button onClick={() => setShowHolds(false)} className="text-gray-400 text-xl">×</button>
        </div>
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          Held orders are saved on this device only. Clearing browser data or switching devices will lose them.
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
                <button onClick={() => recallHold(hold)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold">Recall</button>
                <button onClick={() => deleteHold(hold.id)} className="px-2 py-1.5 bg-red-50 text-red-500 text-xs font-bold">✕</button>
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
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-2">
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
            className="w-full px-3 py-2 border-2 border-gray-200 text-sm focus:border-indigo-400 focus:outline-none"
          />
          {showCustomerSearch && customerResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 shadow-xl z-30 max-h-40 overflow-y-auto">
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
  const Numpad = ({ mobile = false }: { mobile?: boolean }) => {
    const isQty      = numpadTarget === 'qty'
    const isPrice    = numpadTarget === 'price'
    const isDiscount = numpadTarget === 'lineDiscount'
    // Payment targets are handled by PaymentNumpad — only show cart-edit targets here
    const isPayment  = numpadTarget === 'tendered' || numpadTarget === 'momoPaid' || numpadTarget === 'cashPaid'
    const displayVal = isQty ? numpadBuffer : isPrice ? priceBuffer : isDiscount ? discountBuffer : tendered
    const label      = isQty ? 'QTY' : isPrice ? 'PRICE' : isDiscount ? 'DISC' : 'CASH'
    if (isPayment && mobile) return null // PaymentPanel has its own inline numpad

    return (
      <div className="bg-white select-none">
        {/* Mobile drawer pill */}
        {mobile && (
          <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
            <div className="flex gap-1">
              <button onClick={() => setNumpadDrawer(numpadDrawer === 'docked' ? 'drawer' : 'docked')}
                className="px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-600">
                {numpadDrawer === 'docked' ? '↑ Drawer' : '↓ Dock'}
              </button>
              <button onClick={() => setNumpadDrawer('hidden')}
                className="px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-500">✕</button>
            </div>
          </div>
        )}

        {/* Display screen */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-900">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
          <span className="text-xl font-mono font-bold text-white tracking-wider">
            {displayVal || '0'}
          </span>
        </div>

        {/* Keys — 4×3 grid */}
        <div className="grid grid-cols-3 gap-px bg-gray-200">
          {['7','8','9','4','5','6','1','2','3','.',  '0','00'].map(k => (
            <button key={k} onClick={() => numpadPress(k)}
              className="py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-lg font-semibold text-gray-800 touch-manipulation transition-colors">
              {k}
            </button>
          ))}
          {/* Bottom row: Clear | Backspace | Confirm */}
          <button onClick={() => numpadPress('C')}
            className="py-3.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-sm font-bold text-red-600 touch-manipulation transition-colors">
            CLR
          </button>
          <button onClick={() => numpadPress('←')}
            className="py-3.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-lg font-bold text-gray-600 touch-manipulation transition-colors">
            ⌫
          </button>
          <button onClick={() => numpadPress('✓')}
            className="py-3.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-lg font-bold text-white touch-manipulation transition-colors">
            ✓
          </button>
        </div>
      </div>
    )
  }

  // ── Cart line row (shared between mobile and desktop) ───────────────────────
  const canEditPrice =
    user?.role === 'OWNER' ||
    user?.role === 'STORE_MANAGER' ||
    user?.role === 'BRANCH_MANAGER'

  const CartLineRow = ({ line, idx, mobile = false, flash = false }: { line: CartLine; idx: number; mobile?: boolean; flash?: boolean }) => {
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
        className={`px-3 py-2.5 border-b border-gray-100 transition-colors ${flash ? 'bg-green-50 border-l-4 border-l-green-500' : isSelected ? 'bg-indigo-50' : ''}`}
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
                    setShowNumpadDrawer(true)
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
              className="w-7 h-7 bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation hover:bg-red-100 hover:text-red-600 transition-colors"
            >−</button>
            <button
              onClick={() => { setSelectedCartIdx(idx); setNumpadTarget('qty'); setNumpadBuffer(String(line.qty)); setShowNumpadDrawer(true) }}
              className="w-8 h-7 bg-gray-50 border border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
              title="Tap to set qty"
            >
              {line.qty}
            </button>
            <button
              onClick={() => updateQty(idx, line.qty + 1)}
              className="w-7 h-7 bg-gray-100 font-bold text-gray-700 flex items-center justify-center active:scale-95 touch-manipulation hover:bg-green-100 hover:text-green-700 transition-colors"
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
                    className={`px-2.5 py-1 text-xs font-bold border transition-colors ${
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
                <div className="flex border border-gray-200 overflow-hidden">
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
                    className="w-20 px-2 py-1 border border-gray-200 text-xs font-bold focus:border-indigo-400 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingDiscountIdx(idx)
                      setDiscountBuffer(line.lineDiscount ? String(line.lineDiscount) : '')
                      setNumpadTarget('lineDiscount')
                      setSelectedCartIdx(idx)
                      setShowNumpadDrawer(true)
                    }}
                    className="px-2.5 py-1 text-xs font-bold border border-gray-200 hover:border-indigo-300 bg-white"
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

  // ── Inline numpad for payment panel ────────────────────────────────────────
  const PaymentNumpad = () => {
    const keys = ['7','8','9','4','5','6','1','2','3','.','0','←']
    const label = splitMode
      ? numpadTarget === 'momoPaid' ? 'MoMo Amount' : 'Cash Amount'
      : method === 'CASH' ? 'Cash Tendered' : method === 'MOMO' ? 'MoMo Amount' : 'Amount'

    const displayValue = splitMode
      ? numpadTarget === 'momoPaid' ? momoPaid : cashPaid
      : tendered

    return (
      <div className="px-2 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
          {splitMode && (
            <div className="flex gap-1">
              <button
                onClick={() => setNumpadTarget('momoPaid')}
                className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${numpadTarget === 'momoPaid' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}
              >MoMo</button>
              <button
                onClick={() => setNumpadTarget('cashPaid')}
                className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${numpadTarget === 'cashPaid' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}
              >Cash</button>
            </div>
          )}
        </div>
        <div className={`px-3 py-2 mb-1.5 text-right border-2 ${
          splitMode && numpadTarget === 'momoPaid' ? 'border-purple-400 bg-purple-50' :
          splitMode && numpadTarget === 'cashPaid' ? 'border-indigo-400 bg-indigo-50' :
          'border-gray-300 bg-gray-50'
        }`}>
          <span className={`text-2xl font-black tracking-tight ${displayValue ? 'text-gray-900' : 'text-gray-300'}`}>
            {displayValue ? `GHS ${displayValue}` : 'GHS 0.00'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {keys.map(k => (
            <button
              key={k}
              onClick={() => numpadPress(k)}
              className={`py-3 text-base font-bold transition-colors active:scale-95 touch-manipulation ${
                k === '←'
                  ? 'bg-red-50 text-red-500 hover:bg-red-100'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >{k}</button>
          ))}
        </div>
        {/* Quick amount shortcuts for Cash */}
        {!splitMode && method === 'CASH' && grandTotal > 0 && (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {[grandTotal, Math.ceil(grandTotal / 5) * 5, Math.ceil(grandTotal / 10) * 10]
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .slice(0, 3)
              .map(amount => (
                <button
                  key={amount}
                  onClick={() => setTendered(String(amount))}
                  className="py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {formatCurrency(amount)}
                </button>
              ))}
          </div>
        )}
      </div>
    )
  }

  // ── Payment panel (shared) ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const PaymentPanel = (_props: { mobile?: boolean }) => (
    <div className="flex flex-col">
      {/* ── Order discount ── */}
      {features.enableDiscounts && (
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 border-t border-gray-100">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0">Disc</span>
          <div className="flex border border-gray-200 overflow-hidden">
            <button onClick={() => setOrderDiscountMode('pct')}
              className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${orderDiscountMode === 'pct' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>%</button>
            <button onClick={() => setOrderDiscountMode('fixed')}
              className={`px-2 py-0.5 text-[10px] font-bold transition-colors ${orderDiscountMode === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>GHS</button>
          </div>
          <input type="number" inputMode="decimal" value={orderDiscountValue}
            onChange={e => setOrderDiscountValue(e.target.value)}
            placeholder="0"
            className="w-20 px-2 py-0.5 border border-gray-200 text-xs font-bold focus:border-indigo-400 focus:outline-none" />
          {orderDiscountNum > 0 && <span className="text-xs text-green-700 font-semibold">−{formatCurrency(orderDiscountNum)}</span>}
        </div>
      )}

      {/* ── Totals ── */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
        {cartSubtotal !== grandTotal && (
          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
            <span>Subtotal</span><span>{formatCurrency(cartSubtotal)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-bold text-gray-600">TOTAL</span>
          <span className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(grandTotal)}</span>
        </div>
        {/* Split breakdown */}
        {splitMode && (momoPaidNum > 0 || cashPaidNum > 0) && (
          <div className="mt-1 space-y-0.5">
            {momoPaidNum > 0 && (
              <div className="flex justify-between text-xs text-purple-700 font-semibold">
                <span>MoMo</span><span>{formatCurrency(momoPaidNum)}</span>
              </div>
            )}
            {cashPaidNum > 0 && (
              <div className="flex justify-between text-xs text-indigo-700 font-semibold">
                <span>Cash</span><span>{formatCurrency(cashPaidNum)}</span>
              </div>
            )}
            {Math.abs(splitTotal - grandTotal) > 0.001 && (
              <div className="flex justify-between text-xs font-bold text-red-600">
                <span>{splitTotal < grandTotal ? 'Remaining' : 'Excess'}</span>
                <span>{formatCurrency(Math.abs(grandTotal - splitTotal))}</span>
              </div>
            )}
          </div>
        )}
        {!splitMode && method === 'CASH' && tenderedNum > 0 && change >= 0 && (
          <div className="flex justify-between text-sm font-bold text-green-700 mt-0.5">
            <span>Change</span><span>{formatCurrency(change)}</span>
          </div>
        )}
        {!splitMode && method === 'CASH' && tenderedNum > 0 && change < 0 && (
          <div className="flex justify-between text-sm font-bold text-red-600 mt-0.5">
            <span>Short</span><span>{formatCurrency(Math.abs(change))}</span>
          </div>
        )}
        {features.enableCreditSales && selectedCustomer && method === 'CASH' && tenderedNum > 0 && change < 0 && (
          <p className="text-[10px] text-amber-700 mt-0.5">{formatCurrency(Math.abs(change))} added to {selectedCustomer.name}&apos;s balance</p>
        )}
      </div>

      {/* ── Payment method tabs ── */}
      <div className="grid grid-cols-4 border-t border-b border-gray-200">
        {(['CASH', 'MOMO', 'BANK'] as PaymentMethod[]).map(m => (
          <button key={m}
            onClick={() => { setMethod(m); setTendered(''); setMomoPhone(''); setSplitMode(false); setMomoStatus('idle'); setMomoTxId(null) }}
            className={`py-2 text-xs font-bold transition-colors touch-manipulation border-b-2 ${
              method === m && !splitMode ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 bg-white hover:bg-gray-50'
            }`}>
            {m === 'CASH' ? '💵 Cash' : m === 'MOMO' ? '📱 MoMo' : '🏦 Bank'}
          </button>
        ))}
        <button
          onClick={() => {
            setSplitMode(s => !s)
            if (!splitMode) { setNumpadTarget('momoPaid'); setMomoPaid(''); setCashPaid('') }
            else { setMomoStatus('idle'); setMomoTxId(null) }
          }}
          className={`py-2 text-xs font-bold transition-colors touch-manipulation border-b-2 ${
            splitMode ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-gray-500 bg-white hover:bg-gray-50'
          }`}>
          ✂️ Split
        </button>
      </div>

      {/* ── MoMo phone — tap to open modal ── */}
      {(method === 'MOMO' || splitMode) && (
        <div className="px-3 pt-2">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            Customer MoMo Number *
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMomoPhoneModalOpen(true)}
              className={`flex-1 px-3 py-1.5 border-2 text-sm text-left ${
                momoPhone ? 'border-indigo-400 text-gray-900 font-semibold' : 'border-indigo-200 text-gray-400'
              } bg-white hover:border-indigo-500 transition-colors`}
            >
              {momoPhone || 'Tap to enter number…'}
            </button>
            {momoStatus === 'pending' && (
              <span className="flex items-center gap-1 text-xs text-amber-700 font-semibold bg-amber-50 px-2 border border-amber-200 whitespace-nowrap">
                ⏳ Waiting…
              </span>
            )}
            {momoStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs text-green-700 font-semibold bg-green-50 px-2 border border-green-200">
                ✓ Paid
              </span>
            )}
            {momoStatus === 'failed' && (
              <span className="flex items-center gap-1 text-xs text-red-700 font-semibold bg-red-50 px-2 border border-red-200">
                ✗ Failed
              </span>
            )}
          </div>
          {momoStatus === 'pending' && (
            <p className="text-[10px] text-amber-600 mt-0.5">Prompt sent — waiting for customer to approve on their phone.</p>
          )}
        </div>
      )}

      {/* ── Always-visible inline numpad ── */}
      <div className="border-t border-gray-100 mt-1.5">
        <PaymentNumpad />
      </div>

      {/* ── Note + errors ── */}
      <div className="px-3 pb-1 space-y-1.5">
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Sale note (optional)"
          className="w-full px-2.5 py-1.5 border border-gray-200 text-xs focus:border-indigo-400 focus:outline-none" />
        {errorMsg  && <p className="text-xs text-red-600 bg-red-50 px-2 py-1">{errorMsg}</p>}
        {noticeMsg && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1">{noticeMsg}</p>}
      </div>

      {/* ── Charge button — only active when payment amounts equal the total ── */}
      <button
        onClick={() => { if (!paymentComplete || isSubmitting || momoStatus === 'sending' || momoStatus === 'pending') return; void handleCheckout() }}
        disabled={!paymentComplete || isSubmitting || momoStatus === 'sending' || momoStatus === 'pending'}
        className="mx-3 mb-3 py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-lg tracking-wide transition-colors touch-manipulation shadow"
      >
        {momoStatus === 'sending'
          ? 'Sending MoMo request…'
          : momoStatus === 'pending'
          ? 'Waiting for customer…'
          : isSubmitting
          ? 'Processing…'
          : `CHARGE  ${formatCurrency(grandTotal)}`}
      </button>
    </div>
  )

  // ── Item grid tile ──────────────────────────────────────────────────────────
  const ItemTile = ({ item }: { item: PosItem }) => {
    const inCart = cart.find(c => c.itemId === item.id)
    const stockTracked = isStockTracked(item)
    const isLow = stockTracked && isLowStock(item.quantity, item.reorderLevel)
    const displayPrice = resolvePrice(item, globalTier)
    return (
      <button
        onClick={() => addToCart(item)}
        className={`relative flex flex-col items-center justify-center p-2 border-2 text-center transition-all active:scale-95 touch-manipulation ${
          inCart
            ? 'bg-indigo-50 border-indigo-400 shadow-md'
            : isLow
            ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
            : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
        }`}
      >
        {inCart && (
          <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
            {inCart.qty}
          </span>
        )}
        <div
          className={`w-9 h-9 flex items-center justify-center font-bold text-base mb-1 ${
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

  // ── Category picker grid — shown when no category selected and no search ────
  const CategoryPicker = ({ cols }: { cols: string }) => (
    <div className="flex-1 overflow-y-auto p-3">
      {isLoadingItems ? (
        <div className={`grid ${cols} gap-3`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white animate-pulse border border-gray-200" />
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
                className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-transparent bg-white hover:shadow-md active:scale-95 touch-manipulation transition-all"
                style={{ borderColor: (cat.color ?? '#6366f1') + '44' }}
              >
                <div
                  className="w-14 h-14 flex items-center justify-center text-3xl shadow-sm"
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
            className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 bg-white hover:shadow-md active:scale-95 touch-manipulation transition-all hover:border-indigo-300"
          >
            <div className="w-14 h-14 flex items-center justify-center text-3xl bg-gray-100">
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
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white active:scale-95 touch-manipulation transition-transform"
            >
              + Add All
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingItems ? (
            <div className={`grid ${cols} gap-2`}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-24 bg-white animate-pulse border border-gray-200" />
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
      if (!data.valid) {
        setPinError(data.error ?? 'Invalid PIN')
        setPinDigits('')
        return
      }

      if (pendingApprovalSaleId) {
        // Sale already submitted as pending — approve it directly with the grant
        const approveRes = await fetch(`/api/sales/${pendingApprovalSaleId}/approve-with-grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant: data.grant }),
        })
        if (approveRes.ok) {
          setIsPollingApproval(false)
          setShowPinModal(false)
          setPinDigits('')
          onSaleApproved(grandTotal, pendingApprovalSaleId)
        } else {
          const err = await approveRes.json()
          setPinError(err.error ?? 'Approval failed')
          setPinDigits('')
        }
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
        <div className="bg-white shadow-2xl w-full max-w-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 flex items-center justify-center text-2xl shrink-0">🔐</div>
            <div>
              <p className="font-bold text-gray-900">Manager Approval Required</p>
              <p className="text-xs text-gray-500">Enter a manager&apos;s PIN below, or wait for a manager to approve on the <strong>Approvals</strong> page.</p>
            </div>
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-100">
            <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-xs text-amber-700 font-semibold">Waiting for manager approval…</span>
          </div>

          {/* PIN dots */}
          <div className="px-5 pt-5 pb-2">
            <div className="flex justify-center gap-3 mb-1">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 transition-colors ${
                    i < pinDigits.length ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                  }`}
                />
              ))}
            </div>
            {pinError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 mt-2 text-center">{pinError}</p>
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
                    className="h-14 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition-all disabled:opacity-40"
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
                  className="h-14 bg-gray-100 hover:bg-gray-200 active:scale-95 text-xl font-semibold text-gray-800 transition-all disabled:opacity-40"
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
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-sm transition-colors"
            >
              {isPinVerifying ? 'Verifying…' : 'Approve'}
            </button>
            <button
              onClick={async () => {
                setShowPinModal(false)
                setPinDigits('')
                setPinError('')
                setIsPollingApproval(false)
                // Reject the pending sale so it doesn't linger in the approvals queue
                if (pendingApprovalSaleId) {
                  await fetch(`/api/sales/${pendingApprovalSaleId}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: 'Cancelled by cashier' }),
                  }).catch(() => {})
                  setPendingApprovalSaleId(null)
                }
              }}
              className="px-4 py-3 bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
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
          <span className="font-bold text-sm tracking-wide">{tenantName || 'POS Terminal'}</span>
          {currentBranch && <span className="text-indigo-200 text-xs truncate">· {currentBranch.name}</span>}
          <div className="flex-1" />

          {/* Hold order */}
          <button
            onClick={holdOrder}
            disabled={cart.length === 0}
            title="Hold order"
            className="p-1.5 hover:bg-indigo-600 disabled:opacity-40 transition-colors text-xs font-bold"
          >
            ⏸ Hold
          </button>

          {/* Recall holds */}
          <button
            onClick={() => setShowHolds(true)}
            title="Held orders"
            className="relative p-1.5 hover:bg-indigo-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
            {holds.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-indigo-900">
                {holds.length}
              </span>
            )}
          </button>

          {/* Customer display second screen */}
          <button
            onClick={() => window.open('/pos/display', 'customer_display', 'noopener')}
            title="Open customer display on second screen"
            className="p-1.5 hover:bg-indigo-600 transition-colors text-base"
          >
            🖥
          </button>

          {user?.name && <span className="text-indigo-200 text-xs hidden sm:inline">Cashier: {user.name}</span>}

          <div ref={sessionMenuRef} className="relative">
            <button
              onClick={() => setShowSessionMenu(v => !v)}
              title="Logout options"
              className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 transition-colors text-xs font-semibold"
            >
              <span>Logout</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${showSessionMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSessionMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden bg-white text-gray-900 shadow-xl ring-1 ring-black/10 z-40">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-900">{user?.name || 'Current user'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {currentBranch ? `Serving ${currentBranch.name}` : 'POS terminal'}
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" />
                    </svg>
                    Log out
                  </button>
                  <button
                    onClick={handleExitPos}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Exit POS
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── DESKTOP layout (md+) ──────────────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden">

          {/* LEFT — search + category picker or item grid  70% */}
          <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 70%' }}>
            <SearchBar searchRef={searchRef} search={search} setSearch={setSearch} setActiveGroup={setActiveGroup} handleSearchKey={handleSearchKey} features={features} globalTier={globalTier} setGlobalTier={setGlobalTier} />
            {showCategoryPicker
              ? <CategoryPicker cols="grid-cols-3 lg:grid-cols-4" />
              : <ItemGrid cols="grid-cols-3 lg:grid-cols-4" />
            }
          </div>

          {/* RIGHT — cart + controls  30% */}
          <div className="relative flex flex-col bg-white border-l border-gray-200 overflow-hidden" style={{ flex: '0 0 30%' }}>

            {/* Customer */}
            <div className="px-3 pt-3 pb-1 border-b border-gray-100 shrink-0">
              <CustomerPanel />
            </div>

            {/* Cart header */}
            <div className="px-4 py-2 flex items-center justify-between shrink-0">
              <span className="font-bold text-gray-800 text-sm">
                Cart {cart.length > 0 && <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{cart.length}</span>}
              </span>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear</button>
              )}
            </div>

            {/* Scan error banner */}
            {scanError && (
              <div className="shrink-0 bg-red-50 border-b border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                ⚠ {scanError}
              </div>
            )}

            {/* Cart lines */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-gray-300">
                  <span className="text-4xl mb-2">🛒</span>
                  <p className="text-sm">Scan or search to add items</p>
                </div>
              ) : (
                <>
                  <div ref={cartEndRef} />
                  {[...cart].reverse().map((line, reversedIdx) => {
                    const idx = cart.length - 1 - reversedIdx
                    return (
                      <CartLineRow
                        key={line.itemId}
                        line={line}
                        idx={idx}
                        flash={line.itemId === lastScannedItemId}
                      />
                    )
                  })}
                </>
              )}
            </div>

            {/* Payment panel (includes numpad + charge button) */}
            <div className="shrink-0 overflow-y-auto">
              <PaymentPanel />
            </div>

            {/* ── Numpad slide-up drawer (desktop) ── */}
            {showNumpadDrawer && (
              <>
                {/* Backdrop */}
                <div
                  className="absolute inset-0 z-20"
                  onClick={() => setShowNumpadDrawer(false)}
                />
                {/* Drawer panel — slides up from bottom of the cart column */}
                <div className="absolute bottom-0 left-0 right-0 z-30 bg-white shadow-2xl border-t-2 border-indigo-200"
                  style={{ animation: 'slideUp 180ms ease-out' }}>
                  {/* Drag handle + context label */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      {numpadTarget === 'qty' ? 'Set Quantity' : numpadTarget === 'price' ? 'Override Price' : numpadTarget === 'lineDiscount' ? 'Set Discount' : 'Cash Tendered'}
                    </span>
                    <button onClick={() => setShowNumpadDrawer(false)}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
                  </div>
                  <Numpad />
                </div>
              </>
            )}
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
                <span className="absolute top-2 right-8 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {cart.length}
                </span>
              )}
            </button>
          </div>

          {/* Items tab */}
          {mobileTab === 'items' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {scanError && (
                <div className="shrink-0 bg-red-50 border-b border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                  ⚠ {scanError}
                </div>
              )}
              <SearchBar compact searchRef={searchRef} search={search} setSearch={setSearch} setActiveGroup={setActiveGroup} handleSearchKey={handleSearchKey} features={features} globalTier={globalTier} setGlobalTier={setGlobalTier} />
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
                    className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-sm active:scale-95 transition-all"
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
                      className="mt-4 px-5 py-2 bg-indigo-50 text-indigo-600 font-semibold text-sm"
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
                    {[...cart].reverse().map((line, reversedIdx) => {
                      const idx = cart.length - 1 - reversedIdx
                      return (
                        <CartLineRow
                          key={line.itemId}
                          line={line}
                          idx={idx}
                          mobile
                          flash={line.itemId === lastScannedItemId}
                        />
                      )
                    })}
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
                  className="absolute bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white shadow-lg active:scale-95 touch-manipulation"
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
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden  shadow-2xl overflow-hidden">
              {/* Drag handle */}
              <div className="flex justify-center bg-white pt-2 pb-0">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>
              <Numpad mobile />
            </div>
          </>
        )}
      </div>

      <MomoPhoneModal
        open={momoPhoneModalOpen}
        initialValue={momoPhone}
        onAccept={(phone) => { setMomoPhone(phone); setMomoStatus('idle'); setMomoTxId(null) }}
        onClose={() => setMomoPhoneModalOpen(false)}
      />
    </>
  )
}
