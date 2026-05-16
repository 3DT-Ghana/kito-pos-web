'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { DataTable, Column } from '@/components/tables/DataTable'
import { PurchaseWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useBranch } from '@/lib/branch/BranchContext'

/**
 * Purchase Reports Page
 *
 * Detailed purchase analytics and reports
 */

export default function PurchaseReportsPage() {
  const { currentBranchId } = useBranch()
  const [purchases, setPurchases] = useState<PurchaseWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    fetchPurchasesReport()
  }, [startDate, endDate, currentBranchId])

  const fetchPurchasesReport = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ type: 'purchases' })
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(`/api/reports?${params}`)
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setPurchases(data.purchases || data.data || [])
    } catch (error) {
      console.error('Error fetching purchases report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalPurchases = purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0)
  const totalPaid = purchases.reduce((sum, purchase) => sum + purchase.paidAmount, 0)
  const totalCredit = purchases.reduce((sum, purchase) => sum + (purchase.totalAmount - purchase.paidAmount), 0)

  const columns: Column<PurchaseWithDetails>[] = [
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (purchase) => formatDate(purchase.createdAt),
    },
    {
      key: 'supplier',
      label: 'Supplier',
      sortable: true,
      render: (purchase) => purchase.supplier?.name || '-',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      sortable: true,
      render: (purchase) => formatCurrency(purchase.totalAmount),
      className: 'text-right',
    },
    {
      key: 'paidAmount',
      label: 'Paid',
      sortable: true,
      render: (purchase) => formatCurrency(purchase.paidAmount),
      className: 'text-right',
    },
    {
      key: 'creditAmount',
      label: 'Credit',
      sortable: true,
      render: (purchase) => {
        const creditAmount = purchase.totalAmount - purchase.paidAmount
        return (
          <span className={creditAmount > 0 ? 'text-red-600 font-medium' : ''}>
            {formatCurrency(creditAmount)}
          </span>
        )
      },
      className: 'text-right',
    },
  ]

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Reports</h1>
            <p className="text-sm text-gray-500 mt-1">
              Detailed purchase analytics and supplier insights
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <ExportButton
              filename="purchases-report"
              getData={() => purchases.map(p => ({
                Date: formatDate(p.createdAt),
                Supplier: p.supplier?.name || '-',
                'Total (GHS)': p.totalAmount.toFixed(2),
                'Paid (GHS)': p.paidAmount.toFixed(2),
                'Credit (GHS)': (p.totalAmount - p.paidAmount).toFixed(2),
              }))}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Purchases</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{purchases.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Amount</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {formatCurrency(totalPurchases)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Paid</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(totalPaid)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Credit</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(totalCredit)}
            </div>
          </div>
        </div>

        {/* Purchases Table */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading purchases...</div>
          </div>
        ) : (
          <DataTable
            data={purchases}
            columns={columns}
            searchPlaceholder="Search purchases..."
            emptyMessage="No purchases found"
          />
        )}
      </div>
    </AppLayout>
  )
}
