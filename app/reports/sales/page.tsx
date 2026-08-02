'use client'
import { smartPrint } from '@/lib/print/print'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { SalesTable } from '@/components/tables/SalesTable'
import { SaleWithDetails } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useBranch } from '@/lib/branch/BranchContext'

/**
 * Sales Reports Page
 *
 * Detailed sales analytics and reports
 */

export default function SalesReportsPage() {
  const { currentBranchId } = useBranch()
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    fetchSalesReport()
  }, [startDate, endDate, currentBranchId])

  const fetchSalesReport = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ type: 'sales' })
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(`/api/reports?${params}`)
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setSales(data.sales || data.data || [])
    } catch (error) {
      console.error('Error fetching sales report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const totalPaid = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
  const totalCredit = sales.reduce((sum, sale) => sum + (sale.totalAmount - sale.paidAmount), 0)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Reports</h1>
            <p className="text-sm text-gray-500 mt-1">
              Detailed sales performance and analytics
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <ExportButton
              filename="sales-report"
              getData={() => sales.map(s => ({
                Date: formatDate(s.createdAt),
                Customer: s.customer?.name || 'Walk-in',
                'Payment Type': s.paymentType,
                'Total (GHS)': s.totalAmount.toFixed(2),
                'Paid (GHS)': s.paidAmount.toFixed(2),
                'Balance (GHS)': (s.totalAmount - s.paidAmount).toFixed(2),
              }))}
            />
            <button
              onClick={() => smartPrint('report')}
              className="px-4 py-2 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="bg-white shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Sales</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{sales.length}</div>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Amount</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {formatCurrency(totalSales)}
            </div>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Paid</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(totalPaid)}
            </div>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Credit</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(totalCredit)}
            </div>
          </div>
        </div>

        {/* Sales Table */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading sales...</div>
          </div>
        ) : (
          <SalesTable sales={sales} />
        )}
      </div>
    </AppLayout>
  )
}
