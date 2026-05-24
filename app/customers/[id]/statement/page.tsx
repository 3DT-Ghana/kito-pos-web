'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { ExportButton } from '@/components/ExportButton'

/**
 * Customer Statement Page
 *
 * Displays a printable account statement for a customer showing:
 * - All sales and payments in chronological order
 * - Running balance after each transaction
 * - Date range filter
 * - Export to PDF via window.print()
 */

type SaleItem = { item?: { name?: string } }
type Transaction =
  | { type: 'sale'; id: string; date: string; totalAmount: number; paidAmount: number; items: SaleItem[] }
  | { type: 'payment'; id: string; date: string; amount: number; method: string }
  | { type: 'transfer'; id: string; date: string; amount: number; description: string; isDebit: boolean; counterparty: string }

export default function CustomerStatementPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customer, setCustomer] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Default: current month
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(todayStr)

  useEffect(() => { fetchCustomer() }, [customerId, startDate, endDate])

  const fetchCustomer = async () => {
    try {
      setIsLoading(true)
      const qp = new URLSearchParams()
      if (startDate) qp.set('startDate', startDate)
      if (endDate) qp.set('endDate', endDate)
      const res = await fetch(`/api/customers/${customerId}?${qp}`)
      if (!res.ok) throw new Error('Failed to fetch customer')
      const data = await res.json()
      setCustomer(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading && !customer) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-16">
          <div className="text-gray-500">Loading statement...</div>
        </div>
      </AppLayout>
    )
  }

  if (error || !customer) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error || 'Customer not found'}
        </div>
      </AppLayout>
    )
  }

  // Build unified, chronologically sorted transaction list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sales: Transaction[] = (customer.sales || []).map((s: any) => ({
    type: 'sale' as const,
    id: s.id,
    date: s.createdAt,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    items: s.items || [],
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentsTx: Transaction[] = (customer.payments || []).map((p: any) => ({
    type: 'payment' as const,
    id: p.id,
    date: p.createdAt,
    amount: p.amount,
    method: p.method,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transfersTx: Transaction[] = (customer.transfers || []).map((t: any) => {
    const isDebit = t.debitCustomerId === customerId
    const counterparty = isDebit
      ? (t.creditCustomer?.name || t.creditSupplier?.name || (t.creditAccount ? `${t.creditAccount.code} ${t.creditAccount.name}` : '') || '')
      : (t.debitCustomer?.name  || t.debitSupplier?.name  || (t.debitAccount  ? `${t.debitAccount.code} ${t.debitAccount.name}`   : '') || '')
    return {
      type: 'transfer' as const,
      id: t.id,
      date: t.date,
      amount: t.amount,
      description: t.description,
      isDebit,
      counterparty,
    }
  })

  const allTx = [...sales, ...paymentsTx, ...transfersTx].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Compute running balance (starting from 0 for the period shown)
  let runningBalance = 0
  const txWithBalance = allTx.map(tx => {
    if (tx.type === 'sale') {
      runningBalance += tx.totalAmount - tx.paidAmount
    } else if (tx.type === 'payment') {
      runningBalance -= tx.amount
    } else {
      // transfer: debit → customer owes more; credit → customer owes less
      runningBalance += tx.isDebit ? tx.amount : -tx.amount
    }
    return { tx, balance: runningBalance }
  })

  const totalSalesValue = sales.reduce((s, tx) => s + (tx.type === 'sale' ? tx.totalAmount : 0), 0)
  const totalPaymentsValue = paymentsTx.reduce((s, tx) => s + (tx.type === 'payment' ? tx.amount : 0), 0)
  const currentBalance = customer.balance

  const periodLabel = startDate && endDate
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : startDate
    ? `From ${formatDate(startDate)}`
    : endDate
    ? `Up to ${formatDate(endDate)}`
    : 'All time'

  return (
    <AppLayout>
      {/* Screen-only toolbar */}
      <div className="max-w-4xl mx-auto mb-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={() => router.push(`/customers/${customerId}`)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {customer.name}
          </button>
          <div className="flex flex-wrap gap-2 flex-1 sm:justify-end items-center">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
            />
            {isLoading && <span className="text-xs text-gray-400">Loading...</span>}
            <ExportButton
              filename={`statement-${customer?.name || 'customer'}-${startDate}-${endDate}`}
              getData={() => txWithBalance.map(({ tx, balance }) => ({
                Date: formatDate(tx.date),
                Type: tx.type === 'sale' ? 'Sale' : tx.type === 'payment' ? 'Payment' : 'Transfer',
                Description: tx.type === 'sale'
                  ? `Sale #${tx.id.slice(0, 8).toUpperCase()}`
                  : tx.type === 'payment'
                  ? 'Payment Received'
                  : tx.description,
                'Debit (GHS)': tx.type === 'sale'
                  ? tx.totalAmount.toFixed(2)
                  : tx.type === 'transfer' && tx.isDebit
                  ? tx.amount.toFixed(2)
                  : '',
                'Credit (GHS)': tx.type === 'sale'
                  ? (tx.paidAmount > 0 ? tx.paidAmount.toFixed(2) : '')
                  : tx.type === 'payment'
                  ? tx.amount.toFixed(2)
                  : tx.type === 'transfer' && !tx.isDebit
                  ? tx.amount.toFixed(2)
                  : '',
                'Balance (GHS)': balance.toFixed(2),
              }))}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 flex items-center gap-2"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Printable statement */}
      <div className="max-w-4xl mx-auto bg-white border border-gray-200 overflow-hidden print:border-0 print:rounded-none print:shadow-none">

        {/* Statement header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-200 print:border-b print:border-gray-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Account Statement</p>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              {customer.phone && <p className="text-sm text-gray-500 mt-1">{customer.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Period</p>
              <p className="text-sm font-semibold text-gray-700">{periodLabel}</p>
              <p className="text-xs text-gray-400 mt-1">Printed: {formatDate(new Date().toISOString())}</p>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-blue-50 p-3 text-center">
              <p className="text-xs font-semibold text-blue-600 uppercase">Sales Value</p>
              <p className="text-lg font-bold text-blue-800 mt-0.5">{formatCurrency(totalSalesValue)}</p>
            </div>
            <div className="bg-green-50 p-3 text-center">
              <p className="text-xs font-semibold text-green-600 uppercase">Payments</p>
              <p className="text-lg font-bold text-green-800 mt-0.5">{formatCurrency(totalPaymentsValue)}</p>
            </div>
            <div className={`p-3 text-center ${currentBalance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className={`text-xs font-semibold uppercase ${currentBalance > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                Current Balance
              </p>
              <p className={`text-lg font-bold mt-0.5 ${currentBalance > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {formatCurrency(currentBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Transaction table */}
        <div className="px-8 py-6">
          {allTx.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No transactions in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-bold text-gray-500 uppercase w-28">Date</th>
                  <th className="text-left py-2 pr-4 text-xs font-bold text-gray-500 uppercase">Description</th>
                  <th className="text-right py-2 pr-4 text-xs font-bold text-gray-500 uppercase w-28">Debit</th>
                  <th className="text-right py-2 pr-4 text-xs font-bold text-gray-500 uppercase w-28">Credit</th>
                  <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase w-28">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txWithBalance.map(({ tx, balance }) => {
                  if (tx.type === 'sale') {
                    const credit = tx.totalAmount - tx.paidAmount
                    return (
                      <tr key={`sale-${tx.id}`} className="hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="py-2.5 pr-4 text-gray-500 text-xs">{formatDate(tx.date)}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-semibold text-gray-900">Sale #{tx.id.slice(0, 8)}</p>
                          {tx.items.length > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {tx.items.map(si => si.item?.name).filter(Boolean).join(', ')}
                            </p>
                          )}
                          {tx.paidAmount > 0 && tx.paidAmount < tx.totalAmount && (
                            <p className="text-xs text-green-600 mt-0.5">Deposit paid: {formatCurrency(tx.paidAmount)}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
                          {formatCurrency(tx.totalAmount)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-green-600 font-semibold">
                          {tx.paidAmount > 0 ? formatCurrency(tx.paidAmount) : '—'}
                        </td>
                        <td className={`py-2.5 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatCurrency(Math.abs(balance))}
                          {balance > 0 && <span className="text-xs font-normal text-red-400 ml-1">DR</span>}
                        </td>
                      </tr>
                    )
                  } else if (tx.type === 'payment') {
                    return (
                      <tr key={`payment-${tx.id}`} className="hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="py-2.5 pr-4 text-gray-500 text-xs">{formatDate(tx.date)}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-semibold text-green-700">Payment Received</p>
                          <p className="text-xs text-gray-400 capitalize mt-0.5">{tx.method?.toLowerCase()}</p>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-400">—</td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-green-600">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className={`py-2.5 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatCurrency(Math.abs(balance))}
                          {balance > 0 && <span className="text-xs font-normal text-red-400 ml-1">DR</span>}
                        </td>
                      </tr>
                    )
                  } else {
                    return (
                      <tr key={`transfer-${tx.id}`} className="hover:bg-purple-50 print:hover:bg-transparent bg-purple-50/30">
                        <td className="py-2.5 pr-4 text-gray-500 text-xs">{formatDate(tx.date)}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-semibold text-purple-700">Transfer</p>
                          <p className="text-xs text-gray-600 mt-0.5">{tx.description}</p>
                          {tx.counterparty && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {tx.isDebit ? 'To: ' : 'From: '}{tx.counterparty}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
                          {tx.isDebit ? formatCurrency(tx.amount) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-green-600">
                          {!tx.isDebit ? formatCurrency(tx.amount) : '—'}
                        </td>
                        <td className={`py-2.5 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatCurrency(Math.abs(balance))}
                          {balance > 0 && <span className="text-xs font-normal text-red-400 ml-1">DR</span>}
                        </td>
                      </tr>
                    )
                  }
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={2} className="py-3 pl-2 font-bold text-gray-700">Period Total</td>
                  <td className="py-3 pr-4 text-right font-bold text-gray-900">{formatCurrency(totalSalesValue)}</td>
                  <td className="py-3 pr-4 text-right font-bold text-green-700">{formatCurrency(totalPaymentsValue)}</td>
                  <td className={`py-3 text-right font-bold text-lg ${currentBalance > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatCurrency(currentBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 mt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center mt-4">
            This statement was generated automatically. Balances are accurate as of the date printed.
          </p>
        </div>
      </div>

    </AppLayout>
  )
}
