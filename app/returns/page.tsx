'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { EmptyState } from '@/components/ui/EmptyState'
import { CustomerReturnWithDetails, SupplierReturnWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  RotateCcw, Search, X, ArrowDownLeft, ArrowUpRight,
  ChevronRight,
} from 'lucide-react'

type Tab = 'customers' | 'suppliers'
type ReturnKind = 'customer' | 'supplier'

const RETURN_TYPE_BADGE: Record<string, { variant: 'green' | 'blue' | 'violet'; label: string }> = {
  CASH:     { variant: 'green',  label: 'Cash'     },
  CREDIT:   { variant: 'blue',   label: 'Credit'   },
  EXCHANGE: { variant: 'violet', label: 'Exchange' },
}

export default function ReturnsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('customers')

  const [customerReturns, setCustomerReturns] = useState<CustomerReturnWithDetails[]>([])
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturnWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [processKind, setProcessKind] = useState<ReturnKind>('customer')

  useEffect(() => { fetchReturns() }, [])

  const fetchReturns = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [cRes, sRes] = await Promise.all([
        fetch('/api/returns/customers'),
        fetch('/api/returns/suppliers'),
      ])
      if (!cRes.ok || !sRes.ok) throw new Error('Failed to load returns')
      const [cData, sData] = await Promise.all([cRes.json(), sRes.json()])
      setCustomerReturns(cData.returns || [])
      setSupplierReturns(sData.returns || [])
    } catch {
      setError('Failed to load returns. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredCustomer = customerReturns.filter(r => {
    const q = search.toLowerCase()
    return !q
      || r.item.name.toLowerCase().includes(q)
      || (r.sale.customer?.name || 'Walk-in').toLowerCase().includes(q)
      || r.saleId.toLowerCase().includes(q)
  })

  const filteredSupplier = supplierReturns.filter(r => {
    const q = search.toLowerCase()
    return !q
      || r.item.name.toLowerCase().includes(q)
      || r.purchase.supplier.name.toLowerCase().includes(q)
      || r.purchaseId.toLowerCase().includes(q)
  })

  const totalCustomerAmount = customerReturns.reduce((s, r) => s + r.amount, 0)
  const totalSupplierAmount = supplierReturns.reduce((s, r) => s + r.amount, 0)

  const switchTab = (t: Tab) => { setTab(t); setSearch('') }

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Returns"
          subtitle={`${customerReturns.length} customer · ${supplierReturns.length} supplier`}
          actions={
            <>
              <Btn
                variant="secondary"
                icon={ArrowUpRight}
                size="sm"
                onClick={() => { setProcessKind('supplier'); setShowProcessModal(true) }}
              >
                Supplier Return
              </Btn>
              <Btn
                icon={ArrowDownLeft}
                onClick={() => { setProcessKind('customer'); setShowProcessModal(true) }}
              >
                Customer Return
              </Btn>
            </>
          }
        />

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Customer Returns"
            value={customerReturns.length}
            sub="items returned by customers"
            icon={ArrowDownLeft}
            accent="bg-red-50"
            iconColor="text-red-500"
          />
          <StatCard
            label="Customer Refunds"
            value={formatCurrency(totalCustomerAmount)}
            sub="total refunded to customers"
            icon={RotateCcw}
            accent="bg-red-50"
            iconColor="text-red-400"
            valueColor="text-red-600"
          />
          <StatCard
            label="Supplier Returns"
            value={supplierReturns.length}
            sub="items sent back to suppliers"
            icon={ArrowUpRight}
            accent="bg-emerald-50"
            iconColor="text-emerald-500"
          />
          <StatCard
            label="Supplier Credits"
            value={formatCurrency(totalSupplierAmount)}
            sub="total received from suppliers"
            icon={RotateCcw}
            accent="bg-emerald-50"
            iconColor="text-emerald-400"
            valueColor="text-emerald-600"
          />
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-1 bg-gray-100 p-1 shrink-0">
            {([
              ['customers', 'Customer Returns'],
              ['suppliers', 'Supplier Returns'],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={
                tab === 'customers'
                  ? 'Search by item or customer…'
                  : 'Search by item or supplier…'
              }
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : tab === 'customers' ? (
          <CustomerReturnsTable
            returns={filteredCustomer}
            total={customerReturns.length}
            search={search}
            onViewSale={id => router.push(`/sales/${id}`)}
          />
        ) : (
          <SupplierReturnsTable
            returns={filteredSupplier}
            total={supplierReturns.length}
            search={search}
            onViewPurchase={id => router.push(`/purchases/${id}`)}
          />
        )}
      </div>

      {showProcessModal && (
        <ProcessReturnModal
          kind={processKind}
          onClose={() => setShowProcessModal(false)}
          onSuccess={() => { setShowProcessModal(false); fetchReturns() }}
        />
      )}
    </AppLayout>
  )
}

/* ── Customer Returns Table ─────────────────────────────────────────────────── */

function CustomerReturnsTable({
  returns,
  total,
  search,
  onViewSale,
}: {
  returns: CustomerReturnWithDetails[]
  total: number
  search: string
  onViewSale: (id: string) => void
}) {
  if (returns.length === 0) {
    return (
      <EmptyState
        icon={RotateCcw}
        title="No customer returns found"
        description={search ? 'Try a different search' : 'Process a return from any sale receipt page'}
      />
    )
  }

  return (
    <>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {returns.map(r => {
          const badge = RETURN_TYPE_BADGE[r.type] ?? { variant: 'slate' as const, label: r.type }
          return (
            <div
              key={r.id}
              onClick={() => onViewSale(r.saleId)}
              className="bg-white shadow-sm ring-1 ring-black/5 p-4 cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.sale.customer?.name || 'Walk-in Customer'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(r.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{formatCurrency(r.amount)}</p>
                  <div className="mt-1">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Qty: <strong>{r.quantity}</strong></span>
                <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                  View sale <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sale ID</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {returns.map(r => {
              const badge = RETURN_TYPE_BADGE[r.type] ?? { variant: 'slate' as const, label: r.type }
              return (
                <tr
                  key={r.id}
                  onClick={() => onViewSale(r.saleId)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(r.createdAt)}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">{r.item.name}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {r.sale.customer?.name || 'Walk-in Customer'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-1 text-gray-700">
                      #{r.saleId.slice(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center font-semibold text-gray-700">{r.quantity}</td>
                  <td className="px-5 py-3.5 text-center">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCurrency(r.amount)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <ChevronRight className="w-4 h-4 text-gray-300 mx-auto" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50/60 border-t border-gray-100">
            <tr>
              <td colSpan={7} className="px-5 py-3 text-xs text-gray-400 font-medium">
                Showing {returns.length} of {total} customer returns
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

/* ── Supplier Returns Table ─────────────────────────────────────────────────── */

function SupplierReturnsTable({
  returns,
  total,
  search,
  onViewPurchase,
}: {
  returns: SupplierReturnWithDetails[]
  total: number
  search: string
  onViewPurchase: (id: string) => void
}) {
  if (returns.length === 0) {
    return (
      <EmptyState
        icon={RotateCcw}
        title="No supplier returns found"
        description={search ? 'Try a different search' : 'Process a return from any purchase detail page'}
      />
    )
  }

  return (
    <>
      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {returns.map(r => {
          const badge = RETURN_TYPE_BADGE[r.type] ?? { variant: 'slate' as const, label: r.type }
          return (
            <div
              key={r.id}
              onClick={() => onViewPurchase(r.purchaseId)}
              className="bg-white shadow-sm ring-1 ring-black/5 p-4 cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.purchase.supplier.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(r.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{formatCurrency(r.amount)}</p>
                  <div className="mt-1">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Qty: <strong>{r.quantity}</strong></span>
                <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                  View purchase <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchase ID</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {returns.map(r => {
              const badge = RETURN_TYPE_BADGE[r.type] ?? { variant: 'slate' as const, label: r.type }
              return (
                <tr
                  key={r.id}
                  onClick={() => onViewPurchase(r.purchaseId)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(r.createdAt)}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">{r.item.name}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{r.purchase.supplier.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-1 text-gray-700">
                      #{r.purchaseId.slice(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-center font-semibold text-gray-700">{r.quantity}</td>
                  <td className="px-5 py-3.5 text-center">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCurrency(r.amount)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <ChevronRight className="w-4 h-4 text-gray-300 mx-auto" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50/60 border-t border-gray-100">
            <tr>
              <td colSpan={7} className="px-5 py-3 text-xs text-gray-400 font-medium">
                Showing {returns.length} of {total} supplier returns
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

/* ── Process Return Modal ───────────────────────────────────────────────────── */

interface SaleOption {
  id: string
  createdAt: string
  customer: { name: string } | null
  items: { itemId: string; quantity: number; price: number; item: { id: string; name: string } }[]
}

interface PurchaseOption {
  id: string
  createdAt: string
  supplier: { name: string }
  items: { itemId: string; quantity: number; costPrice: number; item: { id: string; name: string } }[]
}

function ProcessReturnModal({
  kind,
  onClose,
  onSuccess,
}: {
  kind: ReturnKind
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState<'lookup' | 'form'>('lookup')
  const [lookupId, setLookupId] = useState('')
  const [isLooking, setIsLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [sale, setSale] = useState<SaleOption | null>(null)
  const [purchase, setPurchase] = useState<PurchaseOption | null>(null)

  const [selectedItemId, setSelectedItemId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [returnType, setReturnType] = useState<'CASH' | 'CREDIT' | 'EXCHANGE'>('CASH')
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleLookup = async () => {
    const id = lookupId.trim()
    if (!id) { setLookupError('Enter a sale or purchase ID'); return }
    setIsLooking(true)
    setLookupError(null)
    try {
      const endpoint = kind === 'customer' ? `/api/sales/${id}` : `/api/purchases/${id}`
      const res = await fetch(endpoint)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Not found')
      if (kind === 'customer') {
        setSale(data)
        setSelectedItemId(data.items?.[0]?.item?.id ?? '')
      } else {
        setPurchase(data)
        setSelectedItemId(data.items?.[0]?.item?.id ?? '')
      }
      setStep('form')
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Not found')
    } finally {
      setIsLooking(false)
    }
  }

  const items = kind === 'customer'
    ? (sale?.items || []).map(si => ({ id: si.item.id, name: si.item.name, qty: si.quantity, price: si.price }))
    : (purchase?.items || []).map(pi => ({ id: pi.item.id, name: pi.item.name, qty: pi.quantity, price: pi.costPrice }))

  const selectedItem = items.find(i => i.id === selectedItemId)
  const autoAmount = selectedItem ? (selectedItem.price * quantity).toFixed(2) : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    const amountNum = parseFloat(amount)
    if (!selectedItemId) { setSubmitError('Select an item'); return }
    if (quantity <= 0) { setSubmitError('Quantity must be at least 1'); return }
    if (isNaN(amountNum) || amountNum < 0) { setSubmitError('Enter a valid amount'); return }
    if (selectedItem && quantity > selectedItem.qty) {
      setSubmitError(`Max quantity: ${selectedItem.qty}`)
      return
    }

    setIsSubmitting(true)
    try {
      const endpoint = kind === 'customer' ? '/api/returns/customers' : '/api/returns/suppliers'
      const body = kind === 'customer'
        ? { saleId: sale!.id, itemId: selectedItemId, quantity, type: returnType, amount: amountNum }
        : { purchaseId: purchase!.id, itemId: selectedItemId, quantity, type: returnType, amount: amountNum }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Return failed')
      onSuccess()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = kind === 'customer' ? 'Process Customer Return' : 'Process Supplier Return'
  const accentColor = kind === 'customer' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:shadow-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl z-10">
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {step === 'form' && (
              <button
                onClick={() => { setStep('lookup'); setSale(null); setPurchase(null) }}
                className="text-xs text-blue-600 hover:underline mt-0.5"
              >
                ← Change {kind === 'customer' ? 'sale' : 'purchase'}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {step === 'lookup' ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-500">
              Enter the {kind === 'customer' ? 'Sale' : 'Purchase'} ID to look up the original transaction.
            </p>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {kind === 'customer' ? 'Sale' : 'Purchase'} ID
              </label>
              <input
                type="text"
                value={lookupId}
                onChange={e => setLookupId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="Paste the full ID here…"
                autoFocus
                className="w-full px-4 py-2.5 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 focus:outline-none text-sm font-mono bg-gray-50"
              />
            </div>
            {lookupError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
                {lookupError}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLookup}
                disabled={isLooking}
                className={`flex-1 py-2.5 ${accentColor} text-white font-bold disabled:opacity-50 transition-colors text-sm`}
              >
                {isLooking ? 'Looking up…' : 'Find Transaction'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Context banner */}
            <div className="bg-gray-50 px-4 py-3 text-sm border border-gray-100">
              {kind === 'customer' ? (
                <p className="font-medium text-gray-700">
                  Sale{' '}
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5">
                    #{sale!.id.slice(0, 8).toUpperCase()}
                  </span>
                  {' · '}
                  <span className="font-semibold">{sale!.customer?.name || 'Walk-in'}</span>
                </p>
              ) : (
                <p className="font-medium text-gray-700">
                  Purchase{' '}
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5">
                    #{purchase!.id.slice(0, 8).toUpperCase()}
                  </span>
                  {' · '}
                  <span className="font-semibold">{purchase!.supplier.name}</span>
                </p>
              )}
            </div>

            {/* Item */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Item to Return</label>
              <select
                value={selectedItemId}
                onChange={e => { setSelectedItemId(e.target.value); setQuantity(1); setAmount('') }}
                className="w-full px-3 py-2.5 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 focus:outline-none text-sm bg-gray-50"
              >
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.qty} × {formatCurrency(i.price)})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity stepper */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Quantity
                {selectedItem && (
                  <span className="text-xs font-normal text-gray-400 ml-1.5">max {selectedItem.qty}</span>
                )}
              </label>
              <div className="flex items-center border border-gray-200 overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg border-r border-gray-200 transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={selectedItem?.qty}
                  value={quantity}
                  onChange={e => { setQuantity(parseInt(e.target.value) || 1); setAmount('') }}
                  className="flex-1 text-center font-bold text-gray-900 focus:outline-none py-2.5 text-base"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(q => selectedItem ? Math.min(selectedItem.qty, q + 1) : q + 1)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg border-l border-gray-200 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Return type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Return Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'CREDIT', 'EXCHANGE'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReturnType(t)}
                    className={`py-2.5 text-xs font-bold border-2 transition-colors ${
                      returnType === t
                        ? t === 'CASH'     ? 'bg-emerald-600 text-white border-emerald-600'
                          : t === 'CREDIT' ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t === 'CASH' ? 'Cash' : t === 'CREDIT' ? 'Credit' : 'Exchange'}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount (GH₵)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  placeholder={autoAmount || '0.00'}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 focus:outline-none text-lg font-bold bg-gray-50"
                />
                {autoAmount && !amount && (
                  <button
                    type="button"
                    onClick={() => setAmount(autoAmount)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 font-semibold hover:underline"
                  >
                    Use {formatCurrency(parseFloat(autoAmount))}
                  </button>
                )}
              </div>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
                {submitError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex-1 py-2.5 ${accentColor} text-white font-bold disabled:opacity-50 transition-colors text-sm`}
              >
                {isSubmitting ? 'Processing…' : 'Confirm Return'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
