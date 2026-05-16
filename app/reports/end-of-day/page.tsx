'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'
import { useBranch } from '@/lib/branch/BranchContext'

interface EndOfDayData {
  salesSummary: {
    totalCount: number
    totalRevenue: number
    cashSalesCount: number
    cashSalesAmount: number
    creditSalesCount: number
    creditSalesAmount: number
    averageSaleValue: number
    topSellingItems: { name: string; quantity: number; revenue: number }[]
  }
  cashAndPayments: {
    cashSalesReceived: number
    customerPaymentsByMethod: { CASH: number; MOMO: number; BANK: number }
    totalCustomerPayments: number
    newCreditIssued: number
  }
  purchasesSummary: {
    totalCount: number
    totalAmount: number
    cashPurchasesCount: number
    cashPurchasesAmount: number
    creditPurchasesCount: number
    creditPurchasesAmount: number
    restockedItems: { name: string; quantity: number }[]
    totalSupplierPayments: number
  }
  inventoryAlerts: {
    lowStockItems: { id: string; name: string; quantity: number }[]
    lowStockCount: number
    outOfStockItems: { id: string; name: string; quantity: number }[]
    outOfStockCount: number
    stockAdjustmentsCount: number
  }
  creditAndDebt: {
    totalOutstandingDebt: number
    totalDebtorsCount: number
    newDebtToday: number
    debtCollectedToday: number
    topDebtors: { id: string; name: string; phone: string | null; balance: number }[]
  }
  profitSummary?: {
    totalRevenue: number
    totalCOGS: number
    grossProfit: number
    profitMargin: number
  }
}

export default function EndOfDayReportPage() {
  const { currentBranchId } = useBranch()
  const [data, setData] = useState<EndOfDayData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  )

  useEffect(() => {
    fetchReport()
  }, [selectedDate, currentBranchId])

  const fetchReport = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        type: 'end-of-day',
        startDate: `${selectedDate}T00:00:00.000Z`,
        endDate: `${selectedDate}T23:59:59.999Z`,
      })
      const response = await fetch(`/api/reports?${params}`)
      if (!response.ok) throw new Error('Failed to fetch report')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching end-of-day report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-20">
          <div className="text-gray-500 text-lg">Loading report...</div>
        </div>
      </AppLayout>
    )
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-20">
          <div className="text-red-500">Failed to load report. Please try again.</div>
        </div>
      </AppLayout>
    )
  }

  const netDebtChange = data.creditAndDebt.newDebtToday - data.creditAndDebt.debtCollectedToday

  return (
    <AppLayout>
      <div className="space-y-6 print:space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">End of Day Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Complete daily summary of business activity
            </p>
          </div>
          <div className="flex gap-2">
            <ExportButton
              filename={`end-of-day-${selectedDate}`}
              label="Export Summary"
              getData={() => {
                if (!data) return []
                return [
                  { Section: 'Sales', Metric: 'Total Sales Count', Value: data.salesSummary.totalCount },
                  { Section: 'Sales', Metric: 'Total Revenue (GHS)', Value: data.salesSummary.totalRevenue.toFixed(2) },
                  { Section: 'Sales', Metric: 'Cash Sales Amount (GHS)', Value: data.salesSummary.cashSalesAmount.toFixed(2) },
                  { Section: 'Sales', Metric: 'Credit Sales Amount (GHS)', Value: data.salesSummary.creditSalesAmount.toFixed(2) },
                  { Section: 'Sales', Metric: 'Average Sale Value (GHS)', Value: data.salesSummary.averageSaleValue.toFixed(2) },
                  { Section: 'Payments', Metric: 'Cash Received (GHS)', Value: data.cashAndPayments.cashSalesReceived.toFixed(2) },
                  { Section: 'Payments', Metric: 'MOMO Received (GHS)', Value: data.cashAndPayments.customerPaymentsByMethod.MOMO.toFixed(2) },
                  { Section: 'Payments', Metric: 'Bank Received (GHS)', Value: data.cashAndPayments.customerPaymentsByMethod.BANK.toFixed(2) },
                  { Section: 'Payments', Metric: 'Debt Collected (GHS)', Value: data.cashAndPayments.totalCustomerPayments.toFixed(2) },
                  { Section: 'Payments', Metric: 'New Credit Issued (GHS)', Value: data.cashAndPayments.newCreditIssued.toFixed(2) },
                  { Section: 'Purchases', Metric: 'Total Purchases', Value: data.purchasesSummary.totalCount },
                  { Section: 'Purchases', Metric: 'Total Amount (GHS)', Value: data.purchasesSummary.totalAmount.toFixed(2) },
                  { Section: 'Inventory', Metric: 'Low Stock Items', Value: data.inventoryAlerts.lowStockCount },
                  { Section: 'Inventory', Metric: 'Out of Stock Items', Value: data.inventoryAlerts.outOfStockCount },
                  { Section: 'Debt', Metric: 'Total Outstanding (GHS)', Value: data.creditAndDebt.totalOutstandingDebt.toFixed(2) },
                  { Section: 'Debt', Metric: 'Total Debtors', Value: data.creditAndDebt.totalDebtorsCount },
                  ...(data.profitSummary ? [
                    { Section: 'Profit', Metric: 'Gross Profit (GHS)', Value: data.profitSummary.grossProfit.toFixed(2) },
                    { Section: 'Profit', Metric: 'Profit Margin (%)', Value: data.profitSummary.profitMargin },
                  ] : []),
                ]
              }}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 self-start sm:self-auto"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Print Header (visible only when printing) */}
        <div className="hidden print:block text-center mb-4">
          <h1 className="text-xl font-bold">End of Day Report</h1>
          <p className="text-sm text-gray-600">{new Date(selectedDate).toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Date Picker */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 print:hidden">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Section 1: Daily Sales Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
          <div className="bg-blue-600 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Daily Sales Summary</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Sales</div>
                <div className="text-2xl font-bold text-gray-900">{data.salesSummary.totalCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Revenue</div>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(data.salesSummary.totalRevenue)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Cash Sales</div>
                <div className="text-xl font-bold text-green-600">{data.salesSummary.cashSalesCount}</div>
                <div className="text-xs text-gray-400">{formatCurrency(data.salesSummary.cashSalesAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Credit Sales</div>
                <div className="text-xl font-bold text-red-600">{data.salesSummary.creditSalesCount}</div>
                <div className="text-xs text-gray-400">{formatCurrency(data.salesSummary.creditSalesAmount)}</div>
              </div>
            </div>

            <div className="text-sm text-gray-500">
              Average Sale Value: <span className="font-semibold text-gray-900">{formatCurrency(data.salesSummary.averageSaleValue)}</span>
            </div>

            {data.salesSummary.topSellingItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Top Selling Items</h3>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-gray-500 font-medium">#</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Item</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Qty Sold</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesSummary.topSellingItems.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 text-gray-400">{i + 1}</td>
                          <td className="py-2 font-medium">{item.name}</td>
                          <td className="py-2 text-right">{formatNumber(item.quantity)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {data.salesSummary.topSellingItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                        <span className="font-medium text-sm">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatNumber(item.quantity)} sold</div>
                        <div className="text-xs text-gray-500">{formatCurrency(item.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Cash & Payments */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
          <div className="bg-green-600 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Cash & Payments</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Cash Sales Received</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(data.cashAndPayments.cashSalesReceived)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">MOMO Payments</div>
                <div className="text-xl font-bold text-yellow-600">{formatCurrency(data.cashAndPayments.customerPaymentsByMethod.MOMO)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Bank Payments</div>
                <div className="text-xl font-bold text-blue-600">{formatCurrency(data.cashAndPayments.customerPaymentsByMethod.BANK)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <div className="text-sm text-gray-500">Debt Payments Collected</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(data.cashAndPayments.totalCustomerPayments)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">New Credit Issued</div>
                <div className="text-xl font-bold text-red-600">{formatCurrency(data.cashAndPayments.newCreditIssued)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Purchases & Restocking */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
          <div className="bg-purple-600 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Purchases & Restocking</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Purchases</div>
                <div className="text-2xl font-bold text-gray-900">{data.purchasesSummary.totalCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Amount</div>
                <div className="text-2xl font-bold text-purple-600">{formatCurrency(data.purchasesSummary.totalAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Cash Purchases</div>
                <div className="text-xl font-bold text-green-600">{data.purchasesSummary.cashPurchasesCount}</div>
                <div className="text-xs text-gray-400">{formatCurrency(data.purchasesSummary.cashPurchasesAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Credit Purchases</div>
                <div className="text-xl font-bold text-red-600">{data.purchasesSummary.creditPurchasesCount}</div>
                <div className="text-xs text-gray-400">{formatCurrency(data.purchasesSummary.creditPurchasesAmount)}</div>
              </div>
            </div>

            <div className="text-sm text-gray-500">
              Supplier Payments Made: <span className="font-semibold text-gray-900">{formatCurrency(data.purchasesSummary.totalSupplierPayments)}</span>
            </div>

            {data.purchasesSummary.restockedItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Items Restocked</h3>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-gray-500 font-medium">Item</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Qty Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchasesSummary.restockedItems.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 font-medium">{item.name}</td>
                          <td className="py-2 text-right">{formatNumber(item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">
                  {data.purchasesSummary.restockedItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="text-sm text-gray-600">+{formatNumber(item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Inventory Alerts */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
          <div className="bg-orange-500 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Inventory Alerts</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Low Stock</div>
                <div className="text-2xl font-bold text-orange-600">{data.inventoryAlerts.lowStockCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Out of Stock</div>
                <div className="text-2xl font-bold text-red-600">{data.inventoryAlerts.outOfStockCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Adjustments Today</div>
                <div className="text-2xl font-bold text-gray-900">{data.inventoryAlerts.stockAdjustmentsCount}</div>
              </div>
            </div>

            {data.inventoryAlerts.outOfStockItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2">Out of Stock Items</h3>
                <div className="flex flex-wrap gap-2">
                  {data.inventoryAlerts.outOfStockItems.map((item) => (
                    <span key={item.id} className="px-3 py-1 bg-red-50 text-red-700 text-sm rounded-full border border-red-200">
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.inventoryAlerts.lowStockItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-700 mb-2">Low Stock Items</h3>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-gray-500 font-medium">Item</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.inventoryAlerts.lowStockItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2 font-medium">{item.name}</td>
                          <td className="py-2 text-right text-orange-600 font-semibold">{formatNumber(item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">
                  {data.inventoryAlerts.lowStockItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="text-sm font-semibold text-orange-600">{formatNumber(item.quantity)} left</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Credit & Debt Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
          <div className="bg-red-600 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Credit & Debt Summary</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Outstanding</div>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(data.creditAndDebt.totalOutstandingDebt)}</div>
                <div className="text-xs text-gray-400">{data.creditAndDebt.totalDebtorsCount} debtors</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">New Debt Today</div>
                <div className="text-xl font-bold text-red-500">{formatCurrency(data.creditAndDebt.newDebtToday)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Collected Today</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(data.creditAndDebt.debtCollectedToday)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Net Change</div>
                <div className={`text-xl font-bold ${netDebtChange > 0 ? 'text-red-600' : netDebtChange < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  {netDebtChange > 0 ? '+' : ''}{formatCurrency(netDebtChange)}
                </div>
              </div>
            </div>

            {data.creditAndDebt.topDebtors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Top Debtors</h3>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-gray-500 font-medium">Customer</th>
                        <th className="text-left py-2 text-gray-500 font-medium">Phone</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.creditAndDebt.topDebtors.map((debtor) => (
                        <tr key={debtor.id} className="border-b border-gray-100">
                          <td className="py-2 font-medium">{debtor.name}</td>
                          <td className="py-2 text-gray-500">{debtor.phone || '-'}</td>
                          <td className="py-2 text-right text-red-600 font-semibold">{formatCurrency(debtor.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">
                  {data.creditAndDebt.topDebtors.map((debtor) => (
                    <div key={debtor.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                      <div>
                        <div className="font-medium text-sm">{debtor.name}</div>
                        {debtor.phone && <div className="text-xs text-gray-500">{debtor.phone}</div>}
                      </div>
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(debtor.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 6: Profit Summary (conditional) */}
        {data.profitSummary && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:break-inside-avoid">
            <div className="bg-emerald-600 px-4 py-3">
              <h2 className="text-lg font-semibold text-white">Profit Summary</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Revenue</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(data.profitSummary.totalRevenue)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Cost of Goods</div>
                  <div className="text-2xl font-bold text-gray-600">{formatCurrency(data.profitSummary.totalCOGS)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Gross Profit</div>
                  <div className={`text-2xl font-bold ${data.profitSummary.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(data.profitSummary.grossProfit)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Profit Margin</div>
                  <div className={`text-2xl font-bold ${data.profitSummary.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {data.profitSummary.profitMargin}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
