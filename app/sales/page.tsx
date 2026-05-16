'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SaleWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useBranch } from '@/lib/branch/BranchContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ShoppingCart, Search, X, TrendingUp, CreditCard,
  AlertCircle, CheckCircle, Plus, Download
} from 'lucide-react'

type FilterStatus = 'all' | 'paid' | 'partial'
type PaymentFilter = 'all' | 'CASH' | 'CREDIT'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-indigo-500', 'bg-teal-500', 'bg-pink-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function SalesPage() {
  const router = useRouter()
  const { currentBranchId } = useBranch()
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')

  useEffect(() => { fetchSales() }, [currentBranchId])

  const fetchSales = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/sales')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSales(data.sales || data.data || [])
    } catch {
      setError('Failed to load sales. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = sales.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !q
      || s.id.toLowerCase().includes(q)
      || (s.customer?.name || 'Walk-in').toLowerCase().includes(q)
    const credit = s.totalAmount - s.paidAmount
    const matchesFilter =
      filter === 'all' ? true : filter === 'paid' ? credit === 0 : credit > 0
    const matchesPayment =
      paymentFilter === 'all' ? true : s.paymentType === paymentFilter
    return matchesSearch && matchesFilter && matchesPayment
  })

  const totalRevenue = filtered.reduce((s, x) => s + x.paidAmount, 0)
  const totalCredit = filtered.reduce((s, x) => s + Math.max(0, x.totalAmount - x.paidAmount), 0)
  const cashSales = sales.filter(s => s.paymentType === 'CASH').length
  const creditSales = sales.filter(s => s.paymentType === 'CREDIT').length
  const fullyPaid = sales.filter(s => s.totalAmount === s.paidAmount).length
  const partialCount = sales.filter(s => s.totalAmount !== s.paidAmount).length

  const statusTabs = [
    { value: 'all' as FilterStatus, label: 'All', count: sales.length },
    { value: 'paid' as FilterStatus, label: 'Paid', count: fullyPaid, countVariant: 'green' as const },
    { value: 'partial' as FilterStatus, label: 'Partial', count: partialCount, countVariant: 'amber' as const },
  ]

  const paymentTabs = [
    { value: 'all' as PaymentFilter, label: 'All Types' },
    { value: 'CASH' as PaymentFilter, label: 'Cash', count: cashSales, countVariant: 'green' as const },
    { value: 'CREDIT' as PaymentFilter, label: 'Credit', count: creditSales, countVariant: 'blue' as const },
  ]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Sales"
          subtitle={`${sales.length} total transactions`}
          actions={
            <>
              <ExportButton
                filename="sales"
                getData={() => filtered.map(s => ({
                  Date: formatDate(s.createdAt),
                  Customer: s.customer?.name || 'Walk-in',
                  'Payment Type': s.paymentType,
                  'Total (GHS)': s.totalAmount.toFixed(2),
                  'Paid (GHS)': s.paidAmount.toFixed(2),
                  'Balance (GHS)': Math.max(0, s.totalAmount - s.paidAmount).toFixed(2),
                }))}
              />
              <Btn icon={Plus} href="/sales/new">New Sale</Btn>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Sales"
            value={sales.length}
            sub={`${cashSales} cash · ${creditSales} credit`}
            icon={ShoppingCart}
            accent="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Revenue Collected"
            value={formatCurrency(totalRevenue)}
            icon={TrendingUp}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
          />
          <StatCard
            label="Credit Outstanding"
            value={formatCurrency(totalCredit)}
            icon={AlertCircle}
            accent="bg-red-50"
            iconColor="text-red-500"
            valueColor="text-red-600"
          />
          <StatCard
            label="Fully Paid"
            value={fullyPaid}
            icon={CheckCircle}
            accent="bg-violet-50"
            iconColor="text-violet-600"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabBar tabs={statusTabs} active={filter} onChange={setFilter} />
          <TabBar tabs={paymentTabs} active={paymentFilter} onChange={setPaymentFilter} />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 animate-pulse h-32" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No sales found"
            description={search ? 'Try a different search term' : 'Create your first sale to get started'}
            action={!search && (
              <Btn icon={Plus} href="/sales/new" size="sm">Create Sale</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((sale, idx) => {
                const credit = sale.totalAmount - sale.paidAmount
                const name = sale.customer?.name || 'Walk-in Customer'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div
                    key={sale.id}
                    onClick={() => router.push(`/sales/${sale.id}`)}
                    className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-4 cursor-pointer active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${avatarColor(name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
                            <p className="text-xs text-gray-400 font-mono">#{sale.id.slice(0,8).toUpperCase()}</p>
                          </div>
                          <p className="font-bold text-gray-900 shrink-0">{formatCurrency(sale.totalAmount)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-gray-400">{formatDate(sale.createdAt)} · {sale.items?.length || 0} items</p>
                          <div className="flex gap-1">
                            <Badge variant={sale.paymentType === 'CASH' ? 'green' : 'blue'}>
                              {sale.paymentType === 'CASH' ? 'Cash' : 'Credit'}
                            </Badge>
                            <Badge variant={credit === 0 ? 'green' : 'amber'}>
                              {credit === 0 ? 'Paid' : 'Partial'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(sale => {
                    const credit = sale.totalAmount - sale.paidAmount
                    const name = sale.customer?.name || 'Walk-in Customer'
                    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => router.push(`/sales/${sale.id}`)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(sale.createdAt)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">#{sale.id.slice(0,8).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <Badge variant={sale.paymentType === 'CASH' ? 'green' : 'blue'}>
                              {sale.paymentType}
                            </Badge>
                            <span className="text-xs text-gray-400">{sale.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-center text-gray-600">{sale.items?.length || 0}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900 text-right">{formatCurrency(sale.totalAmount)}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-emerald-600 text-right">{formatCurrency(sale.paidAmount)}</td>
                        <td className="px-5 py-3.5 text-sm text-right">
                          {credit > 0
                            ? <span className="font-semibold text-red-600">{formatCurrency(credit)}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <Badge variant={credit === 0 ? 'green' : 'amber'} dot>
                            {credit === 0 ? 'Paid' : 'Partial'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 text-xs text-gray-400 font-medium">
                Showing {filtered.length} of {sales.length} sales
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
