'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useTenantFeatures } from '@/hooks/useTenant'
import { useBranch } from '@/lib/branch/BranchContext'
import { BarcodeGenerator, type LabelItem } from '@/components/barcode/BarcodeGenerator'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { TabBar } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { isInventoryItemType, itemTypeLabel, normalizeItemType } from '@/lib/items/type'
import { Pagination } from '@/components/ui/Pagination'
import {
  Package, Search, X, Clock,
  Plus, Printer, Factory, Sliders, Download, DollarSign
} from 'lucide-react'

type Tab = 'all' | 'low' | 'out' | 'expiring'
interface Category { id: string; name: string; color: string | null; icon: string | null }
interface Item {
  id: string
  name: string
  barcode: string | null
  quantity: number
  costPrice: number
  sellingPrice: number
  expiryDate: string | null
  itemType: 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'
  manufacturer: { id: string; name: string } | null
  category: Category | null
}

export default function ItemsPage() {
  const router = useRouter()
  const { features } = useTenantFeatures()
  const { currentBranchId } = useBranch()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'>('ALL')
  const [manufacturerFilter, setManufacturerFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const [selectedForLabels, setSelectedForLabels] = useState<Set<string>>(new Set())
  const [showBarcodeModal, setShowBarcodeModal] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)

  const toggleSelect = (id: string) =>
    setSelectedForLabels(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const selectAll = () => setSelectedForLabels(new Set(filtered.map(i => i.id)))
  const clearSelection = () => { setSelectedForLabels(new Set()); setIsSelectMode(false) }

  const labelItems: LabelItem[] = items
    .filter(i => selectedForLabels.has(i.id))
    .map(i => ({ id: i.id, name: i.name, barcode: i.barcode, sellingPrice: i.sellingPrice, category: i.category }))

  useEffect(() => { fetchItems() }, [currentBranchId])

  const fetchItems = async () => {
    try {
      const [itemsRes, catsRes] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/categories'),
      ])
      if (!itemsRes.ok) throw new Error('Failed')
      const data = await itemsRes.json()
      setItems(Array.isArray(data) ? data : data.data || [])
      if (catsRes.ok) setCategories(await catsRes.json())
    } finally {
      setIsLoading(false)
    }
  }

  const manufacturers = Array.from(new Set(items.map(i => i.manufacturer?.name).filter(Boolean)))
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const activeTab: Tab = (!features.enableExpiryTracking && tab === 'expiring') ? 'all' : tab
  const inventoryItems = items.filter(i => isInventoryItemType(i.itemType))

  useEffect(() => setPage(1), [search, tab, typeFilter, manufacturerFilter, categoryFilter])

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const isInventoryItem = isInventoryItemType(i.itemType)
    const matchSearch = !q
      || i.name.toLowerCase().includes(q)
      || (i.manufacturer?.name || '').toLowerCase().includes(q)
    const matchType = typeFilter === 'ALL' || normalizeItemType(i.itemType) === typeFilter
    const matchMfr = !manufacturerFilter || i.manufacturer?.name === manufacturerFilter
    const matchCat = !categoryFilter
      || (categoryFilter === 'uncategorized' ? !i.category : i.category?.id === categoryFilter)
    const matchTab =
      activeTab === 'all' ? true
      : activeTab === 'low' ? isInventoryItem && i.quantity > 0 && i.quantity <= 10
      : activeTab === 'out' ? isInventoryItem && i.quantity === 0
      : activeTab === 'expiring' ? (isInventoryItem && !!i.expiryDate && new Date(i.expiryDate) <= thirtyDaysFromNow)
      : false
    return matchSearch && matchType && matchMfr && matchCat && matchTab
  })

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const lowStock = inventoryItems.filter(i => i.quantity > 0 && i.quantity <= 10)
  const outOfStock = inventoryItems.filter(i => i.quantity === 0)
  const expiringSoon = inventoryItems.filter(i => !!i.expiryDate && new Date(i.expiryDate) <= thirtyDaysFromNow)
  const totalValue = inventoryItems.reduce((s, i) => s + i.costPrice * i.quantity, 0)
  const nonStockItemsCount = items.length - inventoryItems.length

  const tabList = [
    { value: 'all' as Tab, label: 'All Items', count: items.length },
    { value: 'low' as Tab, label: 'Low Stock', count: lowStock.length, countVariant: 'amber' as const },
    { value: 'out' as Tab, label: 'Out of Stock', count: outOfStock.length, countVariant: 'red' as const },
    ...(features.enableExpiryTracking ? [{ value: 'expiring' as Tab, label: 'Expiring', count: expiringSoon.length, countVariant: 'amber' as const }] : []),
  ]

  function stockBadge(item: Item) {
    if (!isInventoryItemType(item.itemType)) {
      return <Badge variant={item.itemType === 'SERVICE' ? 'blue' : 'slate'}>{itemTypeLabel(item.itemType)}</Badge>
    }
    if (item.quantity === 0) return <Badge variant="red">Out</Badge>
    if (item.quantity <= 10) return <Badge variant="amber">Low</Badge>
    return <Badge variant="green">In Stock</Badge>
  }

  return (
    <AppLayout>
      {showBarcodeModal && labelItems.length > 0 && (
        <BarcodeGenerator items={labelItems} onClose={() => setShowBarcodeModal(false)} />
      )}

      <div className="space-y-5">
        <PageHeader
          title="Items"
          subtitle={`${items.length} items in your catalog`}
          actions={
            <>
              <ExportButton
                filename="items-catalog"
                getData={() => filtered.map(i => ({
                  Name: i.name,
                  Type: itemTypeLabel(i.itemType),
                  Manufacturer: i.manufacturer?.name || '',
                  Quantity: isInventoryItemType(i.itemType) ? i.quantity : '',
                  'Cost Price (GHS)': i.costPrice.toFixed(2),
                  'Selling Price (GHS)': i.sellingPrice.toFixed(2),
                  'Stock Value (GHS)': isInventoryItemType(i.itemType) ? (i.costPrice * i.quantity).toFixed(2) : '',
                  'Expiry Date': isInventoryItemType(i.itemType) && i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : '',
                }))}
              />
              {features.enableBarcodeGenerator && (
                isSelectMode ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-semibold">{selectedForLabels.size} selected</span>
                    <Btn variant="ghost" size="sm" onClick={selectAll}>All</Btn>
                    <Btn
                      icon={Printer}
                      size="sm"
                      onClick={() => { if (selectedForLabels.size > 0) setShowBarcodeModal(true) }}
                      disabled={selectedForLabels.size === 0}
                    >
                      Print Labels
                    </Btn>
                    <Btn variant="danger" size="sm" onClick={clearSelection}>Cancel</Btn>
                  </div>
                ) : (
                  <Btn variant="secondary" icon={Printer} size="sm" onClick={() => setIsSelectMode(true)}>
                    Print Labels
                  </Btn>
                )
              )}
              <Btn variant="secondary" icon={Factory} size="sm" onClick={() => router.push('/manufacturers')}>
                Manufacturers
              </Btn>
              <Btn variant="secondary" icon={Sliders} size="sm" onClick={() => router.push('/items/adjust-bulk')}>
                Bulk Adjust
              </Btn>
              <Btn variant="secondary" icon={Download} size="sm" onClick={() => router.push('/import/items')}>
                Import
              </Btn>
              <Btn icon={Plus} href="/items/new">Add Item</Btn>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Items"
            value={items.length}
            icon={Package}
            accent="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Inventory Items"
            value={inventoryItems.length}
            sub="Stock-tracked catalog items"
            icon={Factory}
            accent="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <StatCard
            label="Non-Stock Items"
            value={nonStockItemsCount}
            sub="Services + non-inventory"
            icon={Sliders}
            accent="bg-slate-100"
            iconColor="text-slate-600"
          />
          <StatCard
            label="Stock Value"
            value={formatCurrency(totalValue)}
            sub={lowStock.length > 0 ? `${lowStock.length} low-stock item${lowStock.length !== 1 ? 's' : ''}` : 'Tracked inventory only'}
            icon={DollarSign}
            accent="bg-violet-50"
            iconColor="text-violet-600"
            valueColor="text-violet-700"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <TabBar tabs={tabList} active={activeTab} onChange={t => setTab(t)} />

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            className="px-3 py-2 bg-white border border-gray-200 text-sm font-medium focus:outline-none focus:border-blue-400"
          >
            <option value="ALL">All Types</option>
            <option value="INVENTORY">Inventory</option>
            <option value="NON_INVENTORY">Non-Inventory</option>
            <option value="SERVICE">Service</option>
          </select>

          {manufacturers.length > 0 && (
            <select
              value={manufacturerFilter}
              onChange={e => setManufacturerFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 text-sm font-medium focus:outline-none focus:border-blue-400"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map(m => <option key={m} value={m!}>{m}</option>)}
            </select>
          )}

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 text-sm font-medium focus:outline-none focus:border-blue-400"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
              ))}
              <option value="uncategorized">Uncategorized</option>
            </select>
          )}

          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by item or manufacturer..."
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 h-28 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No items found"
            description={search ? 'Try a different search term' : 'Add your first catalog item to get started'}
            action={!search && tab === 'all' && (
              <Btn icon={Plus} href="/items/new" size="sm">Add First Item</Btn>
            )}
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden grid grid-cols-1 gap-3">
              {paginated.map(item => {
                const isInventoryItem = isInventoryItemType(item.itemType)
                const isSelected = selectedForLabels.has(item.id)
                const isExpired = isInventoryItem && item.expiryDate && new Date(item.expiryDate) < now
                const isSoon = isInventoryItem && !isExpired && item.expiryDate && new Date(item.expiryDate) <= thirtyDaysFromNow
                return (
                  <div
                    key={item.id}
                    onClick={() => isSelectMode ? toggleSelect(item.id) : router.push(`/items/${item.id}`)}
                    className={`bg-white shadow-sm ring-1 ring-black/5 p-4 cursor-pointer transition-colors ${isSelected ? 'ring-indigo-400 bg-indigo-50/50' : 'hover:bg-gray-50/50'}`}
                  >
                    <div className="flex items-start gap-3">
                      {isSelectMode && (
                        <input type="checkbox" readOnly checked={isSelected} className="w-4 h-4 accent-indigo-600 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                          {stockBadge(item)}
                        </div>
                        {item.manufacturer && (
                          <p className="text-xs text-blue-600 font-medium mt-0.5">{item.manufacturer.name}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {!isInventoryItem && (
                            <Badge variant={item.itemType === 'SERVICE' ? 'blue' : 'slate'}>
                              {itemTypeLabel(item.itemType)}
                            </Badge>
                          )}
                          {item.category && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-white"
                              style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                            >
                              {item.category.icon} {item.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-gray-50 p-2 text-center">
                        <p className="text-gray-400">{isInventoryItem ? 'Stock' : 'Tracking'}</p>
                        <p className="font-bold text-gray-800">{isInventoryItem ? item.quantity : 'Off'}</p>
                      </div>
                      <div className="bg-gray-50 p-2 text-center">
                        <p className="text-gray-400">Cost</p>
                        <p className="font-bold text-gray-800">{formatCurrency(item.costPrice)}</p>
                      </div>
                      <div className="bg-gray-50 p-2 text-center">
                        <p className="text-gray-400">Sell</p>
                        <p className="font-bold text-emerald-700">{formatCurrency(item.sellingPrice)}</p>
                      </div>
                    </div>
                    {features.enableExpiryTracking && isInventoryItem && (isExpired || isSoon) && (
                      <div className={`mt-2 text-xs font-semibold px-2 py-1 flex items-center gap-1 ${isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        <Clock className="w-3 h-3" />
                        {isExpired ? 'Expired' : 'Expires'} {new Date(item.expiryDate!).toLocaleDateString()}
                      </div>
                    )}
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
                    {isSelectMode && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedForLabels.size === filtered.length && filtered.length > 0}
                          onChange={e => e.target.checked ? selectAll() : setSelectedForLabels(new Set())}
                          className="w-4 h-4 accent-indigo-600"
                        />
                      </th>
                    )}
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Manufacturer</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Selling</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                    {features.enableExpiryTracking && (
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry</th>
                    )}
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map(item => {
                    const isInventoryItem = isInventoryItemType(item.itemType)
                    const isExpired = isInventoryItem && item.expiryDate && new Date(item.expiryDate) < now
                    const isSoon = isInventoryItem && !isExpired && item.expiryDate && new Date(item.expiryDate) <= thirtyDaysFromNow
                    return (
                      <tr
                        key={item.id}
                        onClick={() => isSelectMode ? toggleSelect(item.id) : router.push(`/items/${item.id}`)}
                        className={`cursor-pointer transition-colors ${selectedForLabels.has(item.id) ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-blue-50/40'}`}
                      >
                        {isSelectMode && (
                          <td className="px-4 py-3.5">
                            <input type="checkbox" readOnly checked={selectedForLabels.has(item.id)} className="w-4 h-4 accent-indigo-600" />
                          </td>
                        )}
                        <td className="px-5 py-3.5 font-semibold text-gray-900 text-sm">{item.name}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={isInventoryItem ? 'green' : item.itemType === 'SERVICE' ? 'blue' : 'slate'}>
                            {itemTypeLabel(item.itemType)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          {item.category ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-white"
                              style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                            >
                              {item.category.icon} {item.category.name}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {item.manufacturer ? (
                            <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5">
                              {item.manufacturer.name}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center font-bold text-gray-900">{isInventoryItem ? item.quantity : '—'}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-gray-600">{formatCurrency(item.costPrice)}</td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold text-emerald-600">{formatCurrency(item.sellingPrice)}</td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold text-gray-700">
                          {isInventoryItem ? formatCurrency(item.costPrice * item.quantity) : '—'}
                        </td>
                        {features.enableExpiryTracking && (
                          <td className="px-5 py-3.5 text-sm">
                            {isInventoryItem && item.expiryDate ? (
                              <span className={`font-medium flex items-center gap-1 ${isExpired ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-gray-500'}`}>
                                {(isExpired || isSoon) && <Clock className="w-3 h-3" />}
                                {new Date(item.expiryDate).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-center">
                          {stockBadge(item)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50/80 border-t border-gray-100">
                  <tr>
                    <td colSpan={isSelectMode ? 8 : 7}
                      className="px-5 py-3 text-xs font-bold text-gray-600">
                      Tracked Inventory Value ({filtered.filter(i => isInventoryItemType(i.itemType)).length} items)
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">
                      {formatCurrency(filtered.reduce((s, i) => s + (isInventoryItemType(i.itemType) ? i.costPrice * i.quantity : 0), 0))}
                    </td>
                    {features.enableExpiryTracking && <td />}
                    <td />
                  </tr>
                </tfoot>
              </table>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{filtered.length} of {items.length} results</span>
                <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
