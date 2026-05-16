'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PurchaseWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ShoppingBag, Search, X, TrendingDown, AlertCircle, CheckCircle, Plus
} from 'lucide-react'

type FilterStatus = 'all' | 'paid' | 'partial'

const AVATAR_COLORS = [
  'bg-orange-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-blue-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function PurchasesPage() {
  const router = useRouter()
  const { currentBranchId } = useBranch()
  const [purchases, setPurchases] = useState<PurchaseWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => { fetchPurchases() }, [currentBranchId])

  const fetchPurchases = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/purchases')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setPurchases(data.purchases || data.data || [])
    } catch {
      setError('Failed to load purchases. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = purchases.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q
      || p.id.toLowerCase().includes(q)
      || (p.supplier?.name || '').toLowerCase().includes(q)
    const credit = p.totalAmount - p.paidAmount
    const matchesFilter =
      filter === 'all' ? true : filter === 'paid' ? credit === 0 : credit > 0
    return matchesSearch && matchesFilter
  })

  const totalSpend = filtered.reduce((s, x) => s + x.paidAmount, 0)
  const totalOwed = filtered.reduce((s, x) => s + Math.max(0, x.totalAmount - x.paidAmount), 0)
  const fullyPaid = purchases.filter(p => p.totalAmount === p.paidAmount).length
  const partialCount = purchases.filter(p => p.totalAmount !== p.paidAmount).length

  const statusTabs = [
    { value: 'all' as FilterStatus, label: 'All', count: purchases.length },
    { value: 'paid' as FilterStatus, label: 'Paid', count: fullyPaid, countVariant: 'green' as const },
    { value: 'partial' as FilterStatus, label: 'Partial', count: partialCount, countVariant: 'amber' as const },
  ]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Purchases"
          subtitle={`${purchases.length} total purchases`}
          actions={
            <Btn icon={Plus} href="/purchases/new">New Purchase</Btn>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Purchases"
            value={purchases.length}
            icon={ShoppingBag}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <StatCard
            label="Total Spent"
            value={formatCurrency(totalSpend)}
            icon={TrendingDown}
            accent="bg-blue-50"
            iconColor="text-blue-600"
            valueColor="text-blue-700"
          />
          <StatCard
            label="Owed to Suppliers"
            value={formatCurrency(totalOwed)}
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
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by supplier or ID..."
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
            icon={ShoppingBag}
            title="No purchases found"
            description={search ? 'Try a different search term' : 'Record your first purchase'}
            action={!search && (
              <Btn icon={Plus} href="/purchases/new" size="sm">Record Purchase</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(purchase => {
                const credit = purchase.totalAmount - purchase.paidAmount
                const name = purchase.supplier?.name || 'Unknown Supplier'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div
                    key={purchase.id}
                    onClick={() => router.push(`/purchases/${purchase.id}`)}
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
                            <p className="text-xs text-gray-400 font-mono">#{purchase.id.slice(0,8).toUpperCase()}</p>
                          </div>
                          <p className="font-bold text-gray-900 shrink-0">{formatCurrency(purchase.totalAmount)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-gray-400">{formatDate(purchase.createdAt)} · {purchase.items?.length || 0} items</p>
                          <Badge variant={credit === 0 ? 'green' : 'amber'} dot>
                            {credit === 0 ? 'Paid' : `Owe ${formatCurrency(credit)}`}
                          </Badge>
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
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Owed</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(purchase => {
                    const credit = purchase.totalAmount - purchase.paidAmount
                    const name = purchase.supplier?.name || 'Unknown Supplier'
                    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <tr key={purchase.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">#{purchase.id.slice(0,8).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{formatDate(purchase.createdAt)}</td>
                        <td className="px-5 py-3.5 text-sm text-center text-gray-600">{purchase.items?.length || 0}</td>
                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900 text-right">{formatCurrency(purchase.totalAmount)}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-emerald-600 text-right">{formatCurrency(purchase.paidAmount)}</td>
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
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => router.push(`/purchases/${purchase.id}`)}
                              className="text-xs text-blue-600 font-semibold hover:underline"
                            >
                              View
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); router.push(`/purchases/${purchase.id}/edit`) }}
                              className="text-xs text-indigo-600 font-semibold hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 text-xs text-gray-400 font-medium">
                Showing {filtered.length} of {purchases.length} purchases
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
