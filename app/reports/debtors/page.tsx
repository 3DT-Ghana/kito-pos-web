'use client'
import { smartPrint } from '@/lib/print/print'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { CustomersTable } from '@/components/tables/CustomersTable'
import { CustomerWithSummary } from '@/types'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'

/**
 * Debtors Report Page
 *
 * Customers with outstanding balances
 */

export default function DebtorsReportPage() {
  const [customers, setCustomers] = useState<CustomerWithSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDebtorsReport()
  }, [])

  const fetchDebtorsReport = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/reports?type=debtors')
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setCustomers(data.debtors || data.data || [])
    } catch (error) {
      console.error('Error fetching debtors report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalDebtors = customers.length
  const totalDebt = customers.reduce((sum, customer) => sum + customer.balance, 0)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Debtors Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Customers with outstanding balances
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <ExportButton
              filename="debtors-report"
              getData={() => customers.map(c => ({
                Customer: c.name,
                Phone: (c as { phone?: string }).phone || '',
                'Balance Owed (GHS)': c.balance.toFixed(2),
              }))}
            />
            <button
              onClick={() => smartPrint('report')}
              className="px-4 py-2 bg-red-600 text-white font-semibold text-sm hover:bg-red-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Debtors</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{totalDebtors}</div>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Outstanding</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(totalDebt)}
            </div>
          </div>
        </div>

        {/* Debtors Table */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading debtors...</div>
          </div>
        ) : totalDebtors === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3">
            <p className="font-medium">✓ No outstanding customer balances</p>
            <p className="text-sm mt-1">
              All customers have cleared their debts!
            </p>
          </div>
        ) : (
          <CustomersTable customers={customers} />
        )}
      </div>
    </AppLayout>
  )
}
