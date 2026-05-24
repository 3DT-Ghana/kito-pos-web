'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { BarcodeGenerator, type LabelItem } from '@/components/barcode/BarcodeGenerator'
import { PageHeader } from '@/components/ui/PageHeader'
import { Btn } from '@/components/ui/Btn'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useBranch } from '@/lib/branch/BranchContext'
import { formatCurrency } from '@/lib/utils/format'
import { Printer, Search, X, Package, CheckSquare, Square, Filter } from 'lucide-react'

interface Item {
  id: string
  name: string
  barcode: string | null
  quantity: number
  sellingPrice: number
  manufacturer: { name: string } | null
  category: { id: string; name: string; color: string | null } | null
}

type StockFilter = 'all' | 'in' | 'low' | 'out'

export default function BarcodesPage() {
  const { currentBranchId } = useBranch()
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showGenerator, setShowGenerator] = useState(false)

  useEffect(() => { fetchItems() }, [currentBranchId])

  const fetchItems = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/items')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : data.data || [])
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || i.name.toLowerCase().includes(q)
      || (i.manufacturer?.name || '').toLowerCase().includes(q)
      || (i.barcode || '').toLowerCase().includes(q)
    const matchStock =
      stockFilter === 'all' ? true
      : stockFilter === 'out' ? i.quantity === 0
      : stockFilter === 'low' ? i.quantity > 0 && i.quantity <= 10
      : i.quantity > 10
    return matchSearch && matchStock
  })

  const toggleItem = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(i => i.id)))
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0 && !allSelected

  const labelItems: LabelItem[] = items
    .filter(i => selected.has(i.id))
    .map(i => ({
      id: i.id,
      name: i.name,
      barcode: i.barcode,
      sellingPrice: i.sellingPrice,
      category: i.category,
    }))

  const stockTabs: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'in', label: 'In Stock' },
    { value: 'low', label: 'Low Stock' },
    { value: 'out', label: 'Out of Stock' },
  ]

  return (
    <AppLayout>
      {showGenerator && labelItems.length > 0 && (
        <BarcodeGenerator
          items={labelItems}
          onClose={() => setShowGenerator(false)}
        />
      )}

      <div className="space-y-5">
        <PageHeader
          title="Barcode Labels"
          subtitle="Select items, configure labels, and print"
          actions={
            selected.size > 0 ? (
              <>
                <span className="text-sm text-gray-500 font-medium">{selected.size} selected</span>
                <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Btn>
                <Btn icon={Printer} onClick={() => setShowGenerator(true)}>
                  Print Labels ({selected.size})
                </Btn>
              </>
            ) : null
          }
        />

        {/* Instruction banner */}
        <div className="bg-blue-50 border border-blue-100 px-5 py-4 flex items-start gap-3">
          <Printer className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-blue-800">How to print labels</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Select one or more items below, then click <strong>Print Labels</strong> to open the label designer.
              Choose your format (barcode / QR), size, paper, and copies — then print directly from your browser.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Stock filter tabs */}
          <div className="flex gap-1 bg-gray-100 p-1">
            {stockTabs.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setStockFilter(t.value)}
                className={`px-3 py-2 text-sm font-medium transition-all ${
                  stockFilter === t.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, manufacturer, or barcode..."
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

          {/* Select all */}
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : someSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-400" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Results count */}
        {!isLoading && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              {filtered.length} items{search ? ` matching "${search}"` : ''}
            </p>
            {selected.size > 0 && (
              <p className="text-xs text-blue-600 font-semibold">
                {selected.size} of {filtered.length} selected
              </p>
            )}
          </div>
        )}

        {/* Items grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-24 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No items found"
            description={search ? 'Try a different search term' : 'Add items to your inventory first'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(item => {
              const isSelected = selected.has(item.id)
              const stockStatus = item.quantity === 0 ? 'out' : item.quantity <= 10 ? 'low' : 'ok'
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className={`group text-left bg-white shadow-sm ring-1 transition-all p-4 ${
                    isSelected
                      ? 'ring-blue-500 ring-2 bg-blue-50/30'
                      : 'ring-black/5 hover:ring-blue-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                      {item.manufacturer && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{item.manufacturer.name}</p>
                      )}
                    </div>
                    <div className={`w-5 h-5 shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? 'bg-blue-600' : 'bg-gray-100 group-hover:bg-gray-200'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800">{formatCurrency(item.sellingPrice)}</span>
                    <div className="flex items-center gap-1.5">
                      {item.barcode ? (
                        <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                          {item.barcode.slice(0, 10)}{item.barcode.length > 10 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">No barcode</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    {item.category ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-xs font-semibold text-white truncate max-w-28"
                        style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                      >
                        {item.category.name}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      stockStatus === 'out' ? 'bg-red-50 text-red-600'
                      : stockStatus === 'low' ? 'bg-amber-50 text-amber-600'
                      : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {item.quantity} units
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Sticky bottom bar when items selected */}
        {selected.size > 0 && (
          <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-40">
            <div className="bg-slate-900 text-white shadow-xl px-5 py-3 flex items-center gap-4">
              <div>
                <p className="text-sm font-semibold">{selected.size} item{selected.size !== 1 ? 's' : ''} selected</p>
                <p className="text-xs text-slate-400">Ready to print labels</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-slate-400 hover:text-white text-xs font-medium transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowGenerator(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
              >
                <Printer className="w-4 h-4" strokeWidth={1.75} />
                Print Labels
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
