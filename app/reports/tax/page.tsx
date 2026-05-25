'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  FileText,
  Package,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { ExportButton } from '@/components/ExportButton'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { formatTaxLabel } from '@/lib/tax/summary'
import { useBranch } from '@/lib/branch/BranchContext'

type TaxReportType =
  | 'tax-summary'
  | 'tax-collected'
  | 'tax-by-invoice'
  | 'tax-by-product'
  | 'tax-liability'

interface TaxRateOption {
  id: string
  name: string
  ratePercentage: number
}

interface ItemOption {
  id: string
  name: string
  itemType?: string
}

interface CustomerOption {
  id: string
  name: string
}

interface TaxBreakdown {
  taxRateId: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
}

interface TaxReportResponse {
  type: TaxReportType
  summary: Record<string, number>
  rows?: Array<Record<string, unknown>>
  invoices?: Array<Record<string, unknown>>
}

const REPORT_OPTIONS: Array<{
  id: TaxReportType
  title: string
  description: string
  icon: React.ReactNode
}> = [
  {
    id: 'tax-summary',
    title: 'Tax Summary',
    description: 'Net tax by tax type for the selected period.',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    id: 'tax-collected',
    title: 'Tax Collected',
    description: 'Daily tax collection and refund movement.',
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    id: 'tax-by-invoice',
    title: 'Tax by Invoice',
    description: 'Tax captured on each sales invoice.',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: 'tax-by-product',
    title: 'Tax by Product',
    description: 'Tax contribution by item, service, or non-inventory line.',
    icon: <Package className="h-5 w-5" />,
  },
  {
    id: 'tax-liability',
    title: 'Tax Liability',
    description: 'Collected tax grouped by payable account.',
    icon: <Wallet className="h-5 w-5" />,
  },
]

const SUMMARY_CONFIG: Record<
  TaxReportType,
  Array<{ key: string; label: string; currency?: boolean; highlight?: boolean }>
> = {
  'tax-summary': [
    { key: 'totalCollectedTax', label: 'Collected', currency: true },
    { key: 'totalReturnedTax', label: 'Refunded', currency: true },
    { key: 'netTax', label: 'Net Tax', currency: true, highlight: true },
    { key: 'taxTypes', label: 'Tax Types' },
  ],
  'tax-collected': [
    { key: 'totalCollectedTax', label: 'Collected', currency: true },
    { key: 'totalReturnedTax', label: 'Refunded', currency: true },
    { key: 'netTax', label: 'Net Tax', currency: true, highlight: true },
    { key: 'periods', label: 'Days' },
  ],
  'tax-by-invoice': [
    { key: 'invoiceCount', label: 'Invoices' },
    { key: 'totalSubtotal', label: 'Subtotal', currency: true },
    { key: 'totalTax', label: 'Tax', currency: true },
    { key: 'totalAmount', label: 'Gross Total', currency: true, highlight: true },
  ],
  'tax-by-product': [
    { key: 'productCount', label: 'Products' },
    { key: 'totalSalesTax', label: 'Collected', currency: true },
    { key: 'totalReturnedTax', label: 'Refunded', currency: true },
    { key: 'netTax', label: 'Net Tax', currency: true, highlight: true },
  ],
  'tax-liability': [
    { key: 'liabilityLines', label: 'Liability Lines' },
    { key: 'totalCollectedTax', label: 'Collected', currency: true },
    { key: 'totalRefundedTax', label: 'Refunded', currency: true },
    { key: 'netTaxLiability', label: 'Net Liability', currency: true, highlight: true },
  ],
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function offsetDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().split('T')[0]
}

function startOfYear() {
  const d = new Date()
  d.setMonth(0, 1)
  return d.toISOString().split('T')[0]
}

const QUICK_RANGES: Array<{ label: string; start: () => string; end: () => string }> = [
  { label: 'Today', start: todayStr, end: todayStr },
  { label: 'Yesterday', start: () => offsetDate(-1), end: () => offsetDate(-1) },
  { label: 'This Week', start: () => offsetDate(-6), end: todayStr },
  { label: 'This Month', start: startOfMonth, end: todayStr },
  { label: 'This Year', start: startOfYear, end: todayStr },
]

function TaxBreakdownList({ lines }: { lines: TaxBreakdown[] }) {
  if (!lines.length) return <span className="text-gray-400">—</span>

  return (
    <div className="space-y-0.5">
      {lines.map((line) => (
        <div
          key={`${line.taxRateId ?? line.taxName}-${line.taxRatePercentage}`}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span className="text-gray-500">{formatTaxLabel(line)}</span>
          <span className="font-semibold tabular-nums text-gray-800">
            {formatCurrency(line.taxAmount)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SummaryCardSkeleton() {
  return (
    <div className="animate-pulse border border-gray-200 bg-white p-4">
      <div className="h-4 w-20  bg-gray-200" />
      <div className="mt-3 h-7 w-32  bg-gray-200" />
    </div>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="overflow-hidden border border-gray-200 bg-white animate-pulse">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="h-5 w-40  bg-gray-200" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className={`h-4  bg-gray-100 ${j === 0 ? 'w-32' : 'w-20'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyTableState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="bg-gray-100 p-4">
        <BarChart3 className="h-8 w-8 text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-600">{message}</p>
      <p className="text-xs text-gray-400">
        Try adjusting the date range or removing filters.
      </p>
    </div>
  )
}

export default function TaxReportsPage() {
  const { currentBranchId } = useBranch()
  const [reportType, setReportType] = useState<TaxReportType>('tax-summary')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [taxRateId, setTaxRateId] = useState('')
  const [productId, setProductId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [data, setData] = useState<TaxReportResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const hasFilters = startDate || endDate || taxRateId || productId || customerId

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
    setTaxRateId('')
    setProductId('')
    setCustomerId('')
  }

  const applyQuickRange = (range: (typeof QUICK_RANGES)[number]) => {
    setStartDate(range.start())
    setEndDate(range.end())
  }

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [taxRateRes, itemRes, customerRes] = await Promise.all([
          fetch('/api/tax/rates'),
          fetch('/api/items'),
          fetch('/api/customers'),
        ])

        if (taxRateRes.ok) {
          const taxRateData = await taxRateRes.json()
          setTaxRates(taxRateData.taxRates ?? [])
        }

        if (itemRes.ok) {
          const itemData = await itemRes.json()
          setItems(Array.isArray(itemData) ? itemData : [])
        }

        if (customerRes.ok) {
          const customerData = await customerRes.json()
          setCustomers(
            Array.isArray(customerData) ? customerData : (customerData.customers ?? [])
          )
        }
      } catch {
        // Keep filters optional if reference lookups fail.
      }
    }

    loadReferenceData()
  }, [])

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoading(true)
        setError('')
        const params = new URLSearchParams({ type: reportType })
        if (startDate) params.append('startDate', startDate)
        if (endDate) params.append('endDate', endDate)
        if (taxRateId) params.append('taxRateId', taxRateId)
        if (productId) params.append('productId', productId)
        if (customerId) params.append('customerId', customerId)

        const response = await fetch(`/api/reports?${params}`)
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Failed to load tax report')
        }

        setData(await response.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tax report')
      } finally {
        setIsLoading(false)
      }
    }

    fetchReport()
  }, [reportType, startDate, endDate, taxRateId, productId, customerId, currentBranchId])

  const exportRows = useMemo(() => {
    if (!data) return []

    switch (reportType) {
      case 'tax-summary':
        return (data.rows ?? []).map((row) => ({
          Tax: formatTaxLabel({
            taxName: String(row.taxName ?? ''),
            taxRatePercentage: Number(row.taxRatePercentage ?? 0),
          }),
          'Sales Taxable': Number(row.salesTaxableAmount ?? 0).toFixed(2),
          'Collected Tax': Number(row.salesTaxAmount ?? 0).toFixed(2),
          'Returned Tax': Number(row.returnTaxAmount ?? 0).toFixed(2),
          'Net Tax': Number(row.netTaxAmount ?? 0).toFixed(2),
        }))
      case 'tax-collected':
        return (data.rows ?? []).map((row) => ({
          Date: String(row.date ?? ''),
          Tax: formatTaxLabel({
            taxName: String(row.taxName ?? ''),
            taxRatePercentage: Number(row.taxRatePercentage ?? 0),
          }),
          'Collected Tax': Number(row.salesTaxAmount ?? 0).toFixed(2),
          'Refunded Tax': Number(row.returnTaxAmount ?? 0).toFixed(2),
          'Net Tax': Number(row.netTaxAmount ?? 0).toFixed(2),
        }))
      case 'tax-by-invoice':
        return (data.invoices ?? []).map((invoice) => ({
          Date: formatDate(String(invoice.createdAt ?? '')),
          Invoice: String(invoice.id ?? '').slice(0, 8).toUpperCase(),
          Customer: String(invoice.customerName ?? ''),
          Subtotal: Number(invoice.subtotalAmount ?? 0).toFixed(2),
          Tax: Number(invoice.taxAmount ?? 0).toFixed(2),
          Total: Number(invoice.totalAmount ?? 0).toFixed(2),
        }))
      case 'tax-by-product':
        return (data.rows ?? []).map((row) => ({
          Product: String(row.productName ?? ''),
          Type: String(row.itemType ?? ''),
          'Qty Sold': Number(row.soldQuantity ?? 0),
          'Qty Returned': Number(row.returnedQuantity ?? 0),
          'Collected Tax': Number(row.salesTaxAmount ?? 0).toFixed(2),
          'Refunded Tax': Number(row.returnTaxAmount ?? 0).toFixed(2),
          'Net Tax': Number(row.netTaxAmount ?? 0).toFixed(2),
        }))
      case 'tax-liability':
        return (data.rows ?? []).map((row) => ({
          Tax: formatTaxLabel({
            taxName: String(row.taxName ?? ''),
            taxRatePercentage: Number(row.taxRatePercentage ?? 0),
          }),
          Account: row.accountCode
            ? `${row.accountCode} - ${row.accountName ?? ''}`
            : 'Unmapped',
          'Collected Tax': Number(row.collectedTax ?? 0).toFixed(2),
          'Refunded Tax': Number(row.refundedTax ?? 0).toFixed(2),
          'Net Liability': Number(row.netTaxLiability ?? 0).toFixed(2),
        }))
    }
  }, [data, reportType])

  const summaryCards = SUMMARY_CONFIG[reportType]

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tax Reports</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review tax collected, refunded, and payable across sales activity.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <ExportButton filename={reportType} label="Export" getData={() => exportRows} />
            <button
              onClick={() => window.print()}
              className="bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Print / PDF
            </button>
          </div>
        </div>

        {/* Report type selector */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {REPORT_OPTIONS.map((option) => {
            const active = reportType === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setReportType(option.id)}
                className={`border-2 p-4 text-left transition-colors ${
                  active
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span
                  className={`mb-2 inline-flex p-1.5 ${
                    active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {option.icon}
                </span>
                <p className={`text-sm font-bold ${active ? 'text-blue-900' : 'text-gray-900'}`}>
                  {option.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  {option.description}
                </p>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div className="border border-gray-200 bg-white p-5">
          {/* Quick ranges */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Quick range:</span>
            {QUICK_RANGES.map((range) => (
              <button
                key={range.label}
                type="button"
                onClick={() => applyQuickRange(range)}
                className={`border px-3 py-1 text-xs font-semibold transition-colors ${
                  startDate === range.start() && endDate === range.end()
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tax Type</label>
              <select
                value={taxRateId}
                onChange={(event) => setTaxRateId(event.target.value)}
                className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All Taxes</option>
                {taxRates.map((taxRate) => (
                  <option key={taxRate.id} value={taxRate.id}>
                    {taxRate.name} ({taxRate.ratePercentage}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Product / Service</label>
              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All Items</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Customer</label>
              <select
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="w-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All Customers</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasFilters && (
            <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SummaryCardSkeleton key={i} />)
            : summaryCards.map((card) => (
                <div
                  key={card.key}
                  className={`border p-4 ${
                    card.highlight
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p
                    className={`mt-2 text-2xl font-bold tabular-nums ${
                      card.highlight ? 'text-blue-700' : 'text-gray-900'
                    }`}
                  >
                    {data
                      ? card.currency
                        ? formatCurrency(data.summary[card.key] ?? 0)
                        : Intl.NumberFormat('en-GH').format(data.summary[card.key] ?? 0)
                      : '—'}
                  </p>
                </div>
              ))}
        </div>

        {/* Tables */}
        {isLoading ? (
          <TableSkeleton cols={reportType === 'tax-by-invoice' ? 7 : 5} />
        ) : data ? (
          <>
            {reportType === 'tax-summary' && (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Tax Summary Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Tax</th>
                        <th className="px-5 py-3 text-right">Taxable Sales</th>
                        <th className="px-5 py-3 text-right">Collected</th>
                        <th className="px-5 py-3 text-right">Refunded</th>
                        <th className="px-5 py-3 text-right">Net Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(data.rows ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <EmptyTableState message="No tax data for this period" />
                          </td>
                        </tr>
                      ) : (
                        (data.rows ?? []).map((row) => (
                          <tr
                            key={`${row.taxRateId ?? row.taxName}-${row.taxRatePercentage}`}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-5 py-3 font-semibold text-gray-900">
                              {formatTaxLabel({
                                taxName: String(row.taxName ?? ''),
                                taxRatePercentage: Number(row.taxRatePercentage ?? 0),
                              })}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                              {formatCurrency(Number(row.salesTaxableAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {formatCurrency(Number(row.salesTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-red-600">
                              {formatCurrency(Number(row.returnTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                              {formatCurrency(Number(row.netTaxAmount ?? 0))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'tax-collected' && (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Daily Tax Activity</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Tax</th>
                        <th className="px-5 py-3 text-right">Collected</th>
                        <th className="px-5 py-3 text-right">Refunded</th>
                        <th className="px-5 py-3 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(data.rows ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <EmptyTableState message="No tax activity for this period" />
                          </td>
                        </tr>
                      ) : (
                        (data.rows ?? []).map((row, index) => (
                          <tr
                            key={`${row.date}-${row.taxRateId ?? row.taxName}-${index}`}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-5 py-3 text-gray-700">{String(row.date ?? '')}</td>
                            <td className="px-5 py-3 font-semibold text-gray-900">
                              {formatTaxLabel({
                                taxName: String(row.taxName ?? ''),
                                taxRatePercentage: Number(row.taxRatePercentage ?? 0),
                              })}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {formatCurrency(Number(row.salesTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-red-600">
                              {formatCurrency(Number(row.returnTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                              {formatCurrency(Number(row.netTaxAmount ?? 0))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'tax-by-invoice' && (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Invoices</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Invoice</th>
                        <th className="px-5 py-3">Customer</th>
                        <th className="px-5 py-3 text-right">Subtotal</th>
                        <th className="px-5 py-3 text-right">Tax</th>
                        <th className="px-5 py-3 text-right">Total</th>
                        <th className="px-5 py-3">Tax Breakdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(data.invoices ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyTableState message="No invoices with tax for this period" />
                          </td>
                        </tr>
                      ) : (
                        (data.invoices ?? []).map((invoice) => (
                          <tr key={String(invoice.id)} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-700">
                              {formatDate(String(invoice.createdAt ?? ''))}
                            </td>
                            <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-900">
                              {String(invoice.id ?? '').slice(0, 8).toUpperCase()}
                            </td>
                            <td className="px-5 py-3 text-gray-700">
                              {String(invoice.customerName ?? 'Walk-in Customer')}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                              {formatCurrency(Number(invoice.subtotalAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {formatCurrency(Number(invoice.taxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                              {formatCurrency(Number(invoice.totalAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3">
                              <TaxBreakdownList
                                lines={(invoice.taxBreakdown as TaxBreakdown[] | undefined) ?? []}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'tax-by-product' && (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Tax by Product</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Product</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3 text-right">Qty Sold</th>
                        <th className="px-5 py-3 text-right">Qty Returned</th>
                        <th className="px-5 py-3 text-right">Collected</th>
                        <th className="px-5 py-3 text-right">Refunded</th>
                        <th className="px-5 py-3 text-right">Net Tax</th>
                        <th className="px-5 py-3">Breakdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(data.rows ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={8}>
                            <EmptyTableState message="No product tax data for this period" />
                          </td>
                        </tr>
                      ) : (
                        (data.rows ?? []).map((row) => (
                          <tr key={String(row.productId)} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-semibold text-gray-900">
                              {String(row.productName ?? '')}
                            </td>
                            <td className="px-5 py-3 text-gray-500">
                              {String(row.itemType ?? '').replaceAll('_', ' ')}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                              {Intl.NumberFormat('en-GH').format(Number(row.soldQuantity ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-red-600">
                              {Intl.NumberFormat('en-GH').format(Number(row.returnedQuantity ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {formatCurrency(Number(row.salesTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-red-600">
                              {formatCurrency(Number(row.returnTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                              {formatCurrency(Number(row.netTaxAmount ?? 0))}
                            </td>
                            <td className="px-5 py-3">
                              <TaxBreakdownList
                                lines={(row.taxBreakdown as TaxBreakdown[] | undefined) ?? []}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'tax-liability' && (
              <div className="overflow-hidden border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Tax Liability Ledger</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Tax</th>
                        <th className="px-5 py-3">Liability Account</th>
                        <th className="px-5 py-3 text-right">Collected</th>
                        <th className="px-5 py-3 text-right">Refunded</th>
                        <th className="px-5 py-3 text-right">Net Liability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(data.rows ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <EmptyTableState message="No tax liability recorded for this period" />
                          </td>
                        </tr>
                      ) : (
                        (data.rows ?? []).map((row, index) => (
                          <tr
                            key={`${row.accountId ?? 'unmapped'}-${row.taxRateId ?? row.taxName}-${index}`}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-5 py-3 font-semibold text-gray-900">
                              {formatTaxLabel({
                                taxName: String(row.taxName ?? ''),
                                taxRatePercentage: Number(row.taxRatePercentage ?? 0),
                              })}
                            </td>
                            <td className="px-5 py-3 text-gray-700">
                              {row.accountCode
                                ? `${row.accountCode} — ${row.accountName ?? ''}`
                                : (
                                  <span className=" bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                    Unmapped
                                  </span>
                                )}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {formatCurrency(Number(row.collectedTax ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-red-600">
                              {formatCurrency(Number(row.refundedTax ?? 0))}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                              {formatCurrency(Number(row.netTaxLiability ?? 0))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
