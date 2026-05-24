'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Truck, Search, X, AlertCircle, CheckCircle, Plus, Phone } from 'lucide-react'

type Tab = 'all' | 'owed' | 'cleared'

interface Supplier {
  id: string
  name: string
  phone: string | null
  balance: number
  _count?: { purchases: number }
}

const AVATAR_COLORS = [
  'bg-orange-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-blue-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function SuppliersPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => { fetchSuppliers() }, [])

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSuppliers(data.suppliers || data.data || data || [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => setPage(1), [search, tab])

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q)
    const matchTab = tab === 'all' ? true : tab === 'owed' ? s.balance > 0 : s.balance === 0
    return matchSearch && matchTab
  })

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalOwed = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0)
  const withDebt = suppliers.filter(s => s.balance > 0)
  const cleared = suppliers.length - withDebt.length

  const tabs = [
    { value: 'all' as Tab, label: 'All', count: suppliers.length },
    { value: 'owed' as Tab, label: 'You Owe', count: withDebt.length, countVariant: 'amber' as const },
    { value: 'cleared' as Tab, label: 'Cleared', count: cleared, countVariant: 'green' as const },
  ]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Suppliers"
          subtitle={`${suppliers.length} suppliers registered`}
          actions={
            <>
              <ExportButton
                filename="suppliers"
                getData={() => filtered.map(s => ({
                  Name: s.name,
                  Phone: s.phone || '',
                  'Balance Owed (GHS)': s.balance.toFixed(2),
                  'Total Purchases': s._count?.purchases ?? '',
                }))}
              />
              <Btn icon={Plus} href="/suppliers/new">Add Supplier</Btn>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            label="Total Suppliers"
            value={suppliers.length}
            icon={Truck}
            accent="bg-orange-50"
            iconColor="text-orange-600"
          />
          <StatCard
            label="You Owe Suppliers"
            value={formatCurrency(totalOwed)}
            sub={`${withDebt.length} outstanding accounts`}
            icon={AlertCircle}
            accent="bg-amber-50"
            iconColor="text-amber-600"
            valueColor="text-amber-700"
          />
          <StatCard
            label="Cleared Accounts"
            value={cleared}
            sub="No outstanding balance"
            icon={CheckCircle}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No suppliers found"
            description={search ? 'Try a different name or phone number' : tab !== 'all' ? 'No suppliers in this category' : 'Add your first supplier to get started'}
            action={!search && tab === 'all' && (
              <Btn icon={Plus} href="/suppliers/new" size="sm">Add First Supplier</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {paginated.map(s => {
                const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/suppliers/${s.id}`)}
                    className="bg-white shadow-sm ring-1 ring-black/5 p-4 flex items-center gap-3 cursor-pointer active:bg-gray-50 transition-colors"
                  >
                    <div className={`w-11 h-11 ${s.balance > 0 ? 'bg-amber-500' : avatarColor(s.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                      {s.phone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{s.phone}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{s._count?.purchases || 0} purchases</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.balance > 0 ? (
                        <>
                          <p className="text-sm font-bold text-amber-600">{formatCurrency(s.balance)}</p>
                          <p className="text-xs text-amber-400">you owe</p>
                        </>
                      ) : (
                        <Badge variant="green">Cleared</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />

            {/* Desktop Table */}
            <div className="hidden md:block bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchases</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">You Owe</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(s => {
                    const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <tr key={s.id} className="hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => router.push(`/suppliers/${s.id}`)}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 ${s.balance > 0 ? 'bg-amber-500' : avatarColor(s.name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                              {initials}
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{s.phone || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-center text-gray-600">{s._count?.purchases || 0}</td>
                        <td className="px-5 py-3.5 text-right">
                          {s.balance > 0
                            ? <span className="font-bold text-amber-600 text-sm">{formatCurrency(s.balance)}</span>
                            : <span className="text-gray-300 text-sm">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <Badge variant={s.balance > 0 ? 'amber' : 'green'} dot>
                            {s.balance > 0 ? 'Outstanding' : 'Cleared'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button className="text-xs text-blue-600 font-semibold hover:underline">
                            View →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{filtered.length} of {suppliers.length} results</span>
                <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
