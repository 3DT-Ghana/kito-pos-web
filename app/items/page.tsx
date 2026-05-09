'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useTenantFeatures } from '@/hooks/useTenant'

type Tab = 'all' | 'low' | 'out' | 'expiring'
interface Category { id: string; name: string; color: string | null; icon: string | null }
interface Item {
  id: string
  name: string
  quantity: number
  costPrice: number
  sellingPrice: number
  expiryDate: string | null
  manufacturer: { id: string; name: string } | null
  category: Category | null
}

export default function ItemsPage() {
  const router = useRouter()
  const { features } = useTenantFeatures()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [manufacturerFilter, setManufacturerFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => { fetchItems() }, [])

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

  // Reset expiring tab if feature is disabled
  const activeTab: Tab = (!features.enableExpiryTracking && tab === 'expiring') ? 'all' : tab

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || i.name.toLowerCase().includes(q)
      || (i.manufacturer?.name || '').toLowerCase().includes(q)
    const matchMfr = !manufacturerFilter || i.manufacturer?.name === manufacturerFilter
    const matchCat = !categoryFilter
      || (categoryFilter === 'uncategorized' ? !i.category : i.category?.id === categoryFilter)
    const matchTab =
      activeTab === 'all' ? true
      : activeTab === 'low' ? i.quantity > 0 && i.quantity <= 10
      : activeTab === 'out' ? i.quantity === 0
      : activeTab === 'expiring' ? (() => {
          if (!i.expiryDate) return false
          return new Date(i.expiryDate) <= thirtyDaysFromNow
        })()
      : false
    return matchSearch && matchMfr && matchCat && matchTab
  })
  const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= 10)
  const outOfStock = items.filter(i => i.quantity === 0)
  const expiringSoon = items.filter(i => {
    if (!i.expiryDate) return false
    const exp = new Date(i.expiryDate)
    return exp <= thirtyDaysFromNow
  })
  const totalValue = items.reduce((s, i) => s + i.costPrice * i.quantity, 0)

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} items in stock</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="inventory"
              getData={() => filtered.map(i => ({
                Name: i.name,
                Manufacturer: i.manufacturer?.name || '',
                Quantity: i.quantity,
                'Cost Price (GHS)': i.costPrice.toFixed(2),
                'Selling Price (GHS)': i.sellingPrice.toFixed(2),
                'Stock Value (GHS)': (i.costPrice * i.quantity).toFixed(2),
                'Expiry Date': i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : '',
              }))}
            />
            <button
              onClick={() => router.push('/manufacturers')}
              className="px-4 py-2.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 text-sm transition-colors"
            >
              🏭 Manufacturers
            </button>
            <button
              onClick={() => router.push('/items/adjust-bulk')}
              className="px-4 py-2.5 border-2 border-indigo-200 text-indigo-700 font-semibold rounded-xl hover:bg-indigo-50 text-sm transition-colors"
            >
              🔧 Bulk Adjust
            </button>
            <button
              onClick={() => router.push('/import/items')}
              className="px-4 py-2.5 border-2 border-indigo-200 text-indigo-700 font-semibold rounded-xl hover:bg-indigo-50 text-sm transition-colors"
            >
              📥 Import
            </button>
            <button
              onClick={() => router.push('/items/new')}
              className="flex items-center justify-center gap-1 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md text-sm"
            >
              <span className="text-lg leading-none">+</span> Add Item
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Items</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{items.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Stock Value</p>
            <p className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(totalValue)}</p>
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${lowStock.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xs font-semibold uppercase ${lowStock.length > 0 ? 'text-amber-600' : 'text-gray-500'}`}>Low Stock</p>
            <p className={`text-2xl font-bold mt-1 ${lowStock.length > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{lowStock.length}</p>
            {lowStock.length > 0 && <p className="text-xs text-amber-600 mt-0.5">≤10 units remaining</p>}
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${outOfStock.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xs font-semibold uppercase ${outOfStock.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>Out of Stock</p>
            <p className={`text-2xl font-bold mt-1 ${outOfStock.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>{outOfStock.length}</p>
          </div>
          {features.enableExpiryTracking && (
            <div
              onClick={() => expiringSoon.length > 0 && setTab('expiring')}
              className={`rounded-xl p-4 border shadow-sm ${expiringSoon.length > 0 ? 'bg-orange-50 border-orange-200 cursor-pointer hover:bg-orange-100' : 'bg-white border-gray-200'}`}
            >
              <p className={`text-xs font-semibold uppercase ${expiringSoon.length > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Expiring Soon</p>
              <p className={`text-2xl font-bold mt-1 ${expiringSoon.length > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{expiringSoon.length}</p>
              {expiringSoon.length > 0 && <p className="text-xs text-orange-600 mt-0.5">Within 30 days</p>}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(([['all', 'All Items'], ['low', 'Low Stock'], ['out', 'Out of Stock'], ...(features.enableExpiryTracking ? [['expiring', 'Expiring Soon']] : [])] as [Tab, string][])).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
                {t === 'low' && lowStock.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{lowStock.length}</span>
                )}
                {t === 'out' && outOfStock.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{outOfStock.length}</span>
                )}
                {t === 'expiring' && expiringSoon.length > 0 && (
                  <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{expiringSoon.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Manufacturer filter */}
          {manufacturers.length > 0 && (
            <select
              value={manufacturerFilter}
              onChange={e => setManufacturerFilter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:outline-none bg-white"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map(m => <option key={m} value={m!}>{m}</option>)}
            </select>
          )}

          {/* Category filter */}
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:outline-none bg-white"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
              ))}
              <option value="uncategorized">Uncategorized</option>
            </select>
          )}

          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by item or manufacturer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-gray-200" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center py-16">
            <span className="text-5xl mb-3">📦</span>
            <p className="font-semibold text-gray-700">No items found</p>
            {!search && tab === 'all' && (
              <button onClick={() => router.push('/items/new')} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
                Add First Item
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: Cards */}
            <div className="md:hidden grid grid-cols-1 gap-3">
              {filtered.map(item => {
                const stockStatus = item.quantity === 0 ? 'out' : item.quantity <= 10 ? 'low' : 'ok'
                return (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/items/${item.id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-base truncate">{item.name}</p>
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">
                          📦 {item.manufacturer?.name || 'Unknown'}
                        </p>
                        {item.category && (
                          <span
                            className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-xs font-semibold text-white"
                            style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                          >
                            {item.category.icon} {item.category.name}
                          </span>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                        stockStatus === 'out' ? 'bg-red-100 text-red-700' :
                        stockStatus === 'low' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {item.quantity} units
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-gray-500">Cost</p>
                        <p className="font-bold text-gray-800">{formatCurrency(item.costPrice)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-gray-500">Selling</p>
                        <p className="font-bold text-green-700">{formatCurrency(item.sellingPrice)}</p>
                      </div>
                    </div>
                    {features.enableExpiryTracking && item.expiryDate && (() => {
                      const exp = new Date(item.expiryDate)
                      const isExpired = exp < now
                      const isSoon = !isExpired && exp <= thirtyDaysFromNow
                      return (isExpired || isSoon) ? (
                        <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-lg ${isExpired ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {isExpired ? '⚠ Expired' : '⏰ Expires'} {exp.toLocaleDateString()}
                        </div>
                      ) : null
                    })()}
                  </div>
                )
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Manufacturer</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Stock</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Cost Price</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Selling Price</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Stock Value</th>
                    {features.enableExpiryTracking && <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Expiry</th>}
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => {
                    const stockStatus = item.quantity === 0 ? 'out' : item.quantity <= 10 ? 'low' : 'ok'
                    return (
                      <tr
                        key={item.id}
                        onClick={() => router.push(`/items/${item.id}`)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900">{item.name}</td>
                        <td className="px-6 py-4">
                          {item.category ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                              style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                            >
                              {item.category.icon} {item.category.name}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-lg">
                            {item.manufacturer?.name || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-gray-900">{item.quantity}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-700">{formatCurrency(item.costPrice)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-green-700">{formatCurrency(item.sellingPrice)}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-800">
                          {formatCurrency(item.costPrice * item.quantity)}
                        </td>
                        {features.enableExpiryTracking && (
                          <td className="px-6 py-4 text-sm">
                            {item.expiryDate ? (() => {
                              const exp = new Date(item.expiryDate)
                              const isExpired = exp < now
                              const isSoon = !isExpired && exp <= thirtyDaysFromNow
                              return (
                                <span className={`font-medium ${isExpired ? 'text-red-600' : isSoon ? 'text-orange-600' : 'text-gray-600'}`}>
                                  {isExpired ? '⚠ ' : isSoon ? '⏰ ' : ''}{exp.toLocaleDateString()}
                                </span>
                              )
                            })() : <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            stockStatus === 'out' ? 'bg-red-100 text-red-700' :
                            stockStatus === 'low' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {stockStatus === 'out' ? 'Out of Stock' : stockStatus === 'low' ? 'Low Stock' : 'In Stock'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={features.enableExpiryTracking ? 7 : 6} className="px-6 py-3 text-sm font-bold text-gray-700">
                      Total Stock Value ({filtered.length} items)
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-blue-700">
                      {formatCurrency(filtered.reduce((s, i) => s + i.costPrice * i.quantity, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
