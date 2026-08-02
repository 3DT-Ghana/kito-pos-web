'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Factory, Search, X, Plus, Package } from 'lucide-react'

interface Manufacturer {
  id: string
  name: string
  _count?: { items: number }
}

export default function ManufacturersPage() {
  const router = useRouter()
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => { fetchManufacturers() }, [])

  const fetchManufacturers = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/manufacturers')
      if (!response.ok) throw new Error('Failed to fetch manufacturers')
      const data = await response.json()
      setManufacturers(Array.isArray(data) ? data : data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manufacturers')
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = manufacturers.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => setPage(1), [search])

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalItems = manufacturers.reduce((s, m) => s + (m._count?.items || 0), 0)

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Brands / Manufacturers"
          subtitle="Manage product brands and manufacturers"
          actions={<Btn icon={Plus} href="/manufacturers/new">New Brand / Manufacturer</Btn>}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Brands / Manufacturers"
            value={manufacturers.length}
            icon={Factory}
            accent="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Products Covered"
            value={totalItems}
            icon={Package}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search brands / manufacturers..."
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

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Factory}
            title="No brands / manufacturers found"
            description={search ? 'Try a different search term' : 'Add your first brand or manufacturer'}
            action={!search && (
              <Btn icon={Plus} href="/manufacturers/new" size="sm">Add Brand / Manufacturer</Btn>
            )}
          />
        ) : (
          <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand / Manufacturer</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(m => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/manufacturers/${m.id}`)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 flex items-center justify-center">
                          <Factory className="w-4 h-4 text-blue-600" strokeWidth={1.75} />
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge variant={m._count?.items ? 'blue' : 'gray'}>
                        {m._count?.items || 0} items
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button className="text-xs text-blue-600 font-semibold hover:underline">
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">{filtered.length} of {manufacturers.length} results</span>
              <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
