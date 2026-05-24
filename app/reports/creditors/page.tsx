'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { SuppliersTable } from '@/components/tables/SuppliersTable'
import { SupplierWithSummary } from '@/types'
import { formatCurrency } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'

/**
 * Creditors Report Page
 *
 * Suppliers with outstanding balances
 */

export default function CreditorsReportPage() {
  const [suppliers, setSuppliers] = useState<SupplierWithSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCreditorsReport()
  }, [])

  const fetchCreditorsReport = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/reports?type=creditors')
      if (!response.ok) throw new Error('Failed to fetch report')
      const data = await response.json()
      setSuppliers(data.creditors || data.data || [])
    } catch (error) {
      console.error('Error fetching creditors report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalCreditors = suppliers.length
  const totalCredit = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Creditors Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Suppliers with outstanding balances (money we owe)
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <ExportButton
              filename="creditors-report"
              getData={() => suppliers.map(s => ({
                Supplier: s.name,
                Phone: (s as { phone?: string }).phone || '',
                'Balance Owed (GHS)': s.balance.toFixed(2),
              }))}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Creditors</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{totalCreditors}</div>
          </div>
          <div className="bg-white shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Owed</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(totalCredit)}
            </div>
          </div>
        </div>

        {/* Creditors Table */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading creditors...</div>
          </div>
        ) : totalCreditors === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3">
            <p className="font-medium">✓ No outstanding supplier balances</p>
            <p className="text-sm mt-1">
              All suppliers have been paid!
            </p>
          </div>
        ) : (
          <SuppliersTable suppliers={suppliers} />
        )}
      </div>
    </AppLayout>
  )
}
