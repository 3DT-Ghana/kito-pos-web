'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useBranch } from '@/lib/branch/BranchContext'

/**
 * Inventory Reports Page
 *
 * Stock levels, valuation, low stock alerts.
 * Supports manufacturer filter and PDF export via print.
 */

interface InventoryReportItem {
  id: string
  name: string
  quantity: number
  sellingPrice: number
  costPrice?: number
  manufacturer: {
    id: string
    name: string
  } | null
}

interface InventoryReportResponse {
  items: InventoryReportItem[]
  meta?: {
    canViewProfitMargins?: boolean
  }
}

export default function InventoryReportsPage() {
  const { currentBranchId } = useBranch()
  const [report, setReport] = useState<InventoryReportResponse | null>(null)
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [manufacturerFilter, setManufacturerFilter] = useState('')

  useEffect(() => {
    fetchManufacturers()
    fetchInventoryReport()
  }, [currentBranchId])

  const fetchManufacturers = async () => {
    try {
      const res = await fetch('/api/manufacturers')
      if (!res.ok) return
      const data = await res.json()
      setManufacturers(Array.isArray(data) ? data : data.data || [])
    } catch {}
  }

  const fetchInventoryReport = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/reports?type=inventory')
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setReport({
        items: data.items || data.data || [],
        meta: data.meta || {},
      })
    } catch (error) {
      console.error('Error fetching inventory report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const items = report?.items || []
  const canViewProfitMargins = Boolean(report?.meta?.canViewProfitMargins)
  const filtered = manufacturerFilter
    ? items.filter(item => item.manufacturer?.id === manufacturerFilter || (item as { manufacturerId?: string }).manufacturerId === manufacturerFilter)
    : items

  const totalItems = filtered.length
  const lowStockItems = filtered.filter(item => item.quantity > 0 && item.quantity <= 10).length
  const outOfStockItems = filtered.filter(item => item.quantity === 0).length
  const totalStockValue = canViewProfitMargins
    ? filtered.reduce((sum, item) => sum + (item.quantity * (item.costPrice ?? 0)), 0)
    : null
  const totalRetailValue = filtered.reduce((sum, item) => sum + (item.quantity * item.sellingPrice), 0)
  const potentialProfit = totalStockValue === null ? null : totalRetailValue - totalStockValue

  const printDate = new Date().toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })
  const selectedMfr = manufacturers.find(m => m.id === manufacturerFilter)

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
            <p className="text-sm text-gray-500 mt-1">Stock levels, valuation, and low stock alerts</p>
          </div>
          <div className="flex gap-2">
            <ExportButton
              filename="inventory-report"
              getData={() => filtered.map(i => ({
                Item: i.name,
                Manufacturer: i.manufacturer?.name || '',
                Stock: i.quantity,
                'Selling Price (GHS)': i.sellingPrice.toFixed(2),
                ...(canViewProfitMargins
                  ? {
                      'Cost Price (GHS)': (i.costPrice ?? 0).toFixed(2),
                      'Stock Value (GHS)': ((i.costPrice ?? 0) * i.quantity).toFixed(2),
                    }
                  : {}),
              }))}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Print title */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
          {selectedMfr && <p className="text-sm text-gray-500">Manufacturer: {selectedMfr.name}</p>}
          <p className="text-xs text-gray-400 mt-1">Printed: {printDate}</p>
        </div>

        {/* Manufacturer filter */}
        <div className="bg-white border border-gray-200 p-4 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-gray-700 shrink-0">Filter by manufacturer:</span>
            <select
              value={manufacturerFilter}
              onChange={e => setManufacturerFilter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none bg-white"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {manufacturerFilter && (
              <button
                onClick={() => setManufacturerFilter('')}
                className="px-3 py-2 text-sm text-gray-500 border-2 border-gray-200 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Items</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalItems}</p>
          </div>
          <div className={`border p-4 ${lowStockItems > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase">Low Stock</p>
            <p className={`text-2xl font-bold mt-1 ${lowStockItems > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{lowStockItems}</p>
          </div>
          <div className={`border p-4 ${outOfStockItems > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase">Out of Stock</p>
            <p className={`text-2xl font-bold mt-1 ${outOfStockItems > 0 ? 'text-red-600' : 'text-gray-900'}`}>{outOfStockItems}</p>
          </div>
          {canViewProfitMargins && totalStockValue !== null && (
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Stock Value</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totalStockValue)}</p>
            </div>
          )}
          {canViewProfitMargins && potentialProfit !== null && (
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Potential Profit</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(potentialProfit)}</p>
            </div>
          )}
        </div>

        {report && !canViewProfitMargins && (
          <div className="bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 print:hidden">
            Cost-based valuation and profit figures are hidden for your role.
          </div>
        )}

        {/* Low Stock Alert */}
        {(lowStockItems > 0 || outOfStockItems > 0) && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 print:hidden">
            <p className="font-semibold">
              {outOfStockItems > 0 && `${outOfStockItems} item${outOfStockItems !== 1 ? 's' : ''} out of stock`}
              {outOfStockItems > 0 && lowStockItems > 0 && ' · '}
              {lowStockItems > 0 && `${lowStockItems} item${lowStockItems !== 1 ? 's' : ''} running low`}
            </p>
          </div>
        )}

        {/* Inventory Table */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12 print:hidden">
            <div className="text-gray-500">Loading inventory...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 px-5 py-10 text-center text-gray-500 text-sm">
            No items found{manufacturerFilter ? ' for this manufacturer' : ''}.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Manufacturer</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Stock</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Sell Price</th>
                  {canViewProfitMargins && (
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cost</th>
                  )}
                  {canViewProfitMargins && (
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Stock Value</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(item => {
                  const stockValue = item.quantity * (item.costPrice ?? 0)
                  const isOut = item.quantity === 0
                  const isLow = !isOut && item.quantity <= 10
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="px-5 py-3 font-semibold text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600">{item.manufacturer?.name || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-gray-900'}`}>
                          {item.quantity}
                        </span>
                        {(isOut || isLow) && (
                          <span className={`ml-1 text-xs px-1.5 py-0.5 -full font-semibold ${isOut ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {isOut ? 'Out' : 'Low'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(item.sellingPrice)}</td>
                      {canViewProfitMargins && (
                        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.costPrice ?? 0)}</td>
                      )}
                      {canViewProfitMargins && (
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(stockValue)}</td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={2} className="px-5 py-3 font-bold text-gray-700">Total ({filtered.length} items)</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {filtered.reduce((s, i) => s + i.quantity, 0)}
                  </td>
                  <td className="px-4 py-3" />
                  {canViewProfitMargins ? (
                    <>
                      <td className="px-4 py-3" />
                      <td className="px-5 py-3 text-right font-bold text-blue-700">{formatCurrency(totalStockValue ?? 0)}</td>
                    </>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
