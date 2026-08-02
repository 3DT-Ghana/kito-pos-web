'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { CustomerFormData } from '@/types/form'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export default function CustomerDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customer, setCustomer] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Date filter
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Toggle expanded sales
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

  // SMS reminder
  const [isSendingReminder, setIsSendingReminder] = useState(false)
  const [reminderMsg, setReminderMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => { fetchCustomer() }, [customerId, startDate, endDate])

  const fetchCustomer = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const response = await fetch(`/api/customers/${customerId}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch customer')
      const data = await response.json()
      setCustomer(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSale = (saleId: string) => {
    setExpandedSales(prev => {
      const next = new Set(prev)
      next.has(saleId) ? next.delete(saleId) : next.add(saleId)
      return next
    })
  }

  const handleSubmit = async (data: CustomerFormData) => {
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update customer')
      }
      setIsEditing(false)
      fetchCustomer()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update customer')
    }
  }

  const handleSendReminder = async () => {
    setIsSendingReminder(true)
    setReminderMsg(null)
    try {
      const res = await fetch('/api/sms/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reminder')
      setReminderMsg({ type: 'success', text: 'Balance reminder SMS sent successfully.' })
    } catch (err) {
      setReminderMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send reminder' })
    } finally {
      setIsSendingReminder(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this customer? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete customer')
      }
      router.push('/customers')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete customer')
    }
  }

  if (isLoading && !customer) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-16">
          <div className="text-gray-500">Loading...</div>
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

  const sales = customer.sales || []
  const payments = customer.payments || []
  const summary = customer.summary || {}

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/customers')} className="p-2 hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-12 h-12 bg-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
              {customer.phone && <p className="text-sm text-gray-500">{customer.phone}</p>}
            </div>
          </div>
          {!isEditing && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => router.push(`/customers/${customerId}/statement`)}
                className="px-3 py-2 bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700"
              >
                📄 Statement
              </button>
              <button
                onClick={() => router.push(`/payments/customers?customerId=${customerId}`)}
                className="px-3 py-2 bg-green-600 text-white font-semibold text-sm hover:bg-green-700"
              >
                💰 Record Payment
              </button>
              {customer.phone && customer.balance > 0 && (
                <button
                  onClick={handleSendReminder}
                  disabled={isSendingReminder}
                  className="px-3 py-2 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSendingReminder ? 'Sending...' : '📱 Send Reminder'}
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-2 border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-2 bg-red-50 text-red-600 border-2 border-red-100 font-semibold text-sm hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`p-4 border-2 ${customer.balance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase">Balance Owed</p>
            <p className={`text-xl font-bold mt-1 ${customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(customer.balance)}
            </p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Sales</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{customer._count?.sales || 0}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Sales Value</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(summary.totalSales || 0)}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Paid</p>
            <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(summary.totalPaid || 0)}</p>
          </div>
        </div>

        {/* SMS Reminder feedback */}
        {reminderMsg && (
          <div className={`px-4 py-3 text-sm font-medium ${reminderMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {reminderMsg.text}
          </div>
        )}

        {/* Edit Form */}
        {isEditing ? (
          <div className="bg-white border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Customer</h2>
            <CustomerForm
              initialData={{ name: customer.name, phone: customer.phone || '' }}
              onSubmit={handleSubmit}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : (
          <>
            {/* Date Filter */}
            <div className="bg-white border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-sm font-semibold text-gray-700 shrink-0">Filter by date:</span>
                <div className="flex flex-wrap gap-2 flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-gray-400 self-center text-sm">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {(startDate || endDate) && (
                    <button
                      onClick={() => { setStartDate(''); setEndDate('') }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 border-2 border-gray-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {isLoading && <span className="text-xs text-gray-400">Loading...</span>}
              </div>
            </div>

            {/* Sales History */}
            <div className="bg-white border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">
                  Sales History
                  <span className="ml-2 text-sm font-normal text-gray-500">({sales.length} {startDate || endDate ? 'in period' : 'recent'})</span>
                </h2>
                {sales.length > 0 && (
                  <button
                    onClick={() => setExpandedSales(expandedSales.size === sales.length ? new Set() : new Set(sales.map((s: { id: string }) => s.id)))}
                    className="text-xs text-blue-600 font-semibold hover:text-blue-800"
                  >
                    {expandedSales.size === sales.length ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
              {sales.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No sales in this period</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {sales.map((sale: any) => {
                    const isExpanded = expandedSales.has(sale.id)
                    const credit = sale.totalAmount - sale.paidAmount
                    return (
                      <div key={sale.id}>
                        {/* Sale row — clickable to toggle */}
                        <button
                          type="button"
                          onClick={() => toggleSale(sale.id)}
                          className="w-full px-5 py-3.5 text-left hover:bg-gray-50 flex items-center gap-3"
                        >
                          <span className={`text-gray-400 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{formatDate(sale.createdAt)}</span>
                              <span className={`text-xs px-2 py-0.5 -full font-semibold ${
                                credit > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {credit > 0 ? 'Credit' : 'Paid'}
                              </span>
                              <span className="text-xs text-gray-400">#{sale.id.slice(0, 8)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {sale.items?.length || 0} item{sale.items?.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-gray-900 text-sm">{formatCurrency(sale.totalAmount)}</p>
                            {credit > 0 && <p className="text-xs text-red-600">Credit: {formatCurrency(credit)}</p>}
                          </div>
                        </button>

                        {/* Expanded item details */}
                        {isExpanded && (
                          <div className="px-5 pb-4 bg-blue-50 border-t border-blue-100">
                            <div className="pt-3 space-y-2">
                              <div className="grid grid-cols-3 text-xs font-bold text-gray-500 uppercase px-2 pb-1 border-b border-blue-200">
                                <span>Item</span>
                                <span className="text-center">Qty × Price</span>
                                <span className="text-right">Subtotal</span>
                              </div>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {sale.items?.map((si: any) => (
                                <div key={si.id} className="grid grid-cols-3 text-sm px-2 py-1">
                                  <div>
                                    <p className="font-semibold text-gray-900">{si.item?.name}</p>
                                    {si.item?.manufacturer?.name && (
                                      <p className="text-xs text-blue-600">{si.item.manufacturer.name}</p>
                                    )}
                                  </div>
                                  <p className="text-center text-gray-600">{si.quantity} × {formatCurrency(si.price)}</p>
                                  <p className="text-right font-semibold text-gray-900">{formatCurrency(si.quantity * si.price)}</p>
                                </div>
                              ))}
                              <div className="grid grid-cols-3 text-sm px-2 pt-2 border-t border-blue-200 font-bold">
                                <span className="text-gray-700">Total</span>
                                <span />
                                <span className="text-right text-gray-900">{formatCurrency(sale.totalAmount)}</span>
                              </div>
                              <div className="grid grid-cols-3 text-sm px-2 font-semibold">
                                <span className="text-green-700">Paid</span>
                                <span />
                                <span className="text-right text-green-700">{formatCurrency(sale.paidAmount)}</span>
                              </div>
                              {credit > 0 && (
                                <div className="grid grid-cols-3 text-sm px-2 font-semibold">
                                  <span className="text-red-600">Credit</span>
                                  <span />
                                  <span className="text-right text-red-600">{formatCurrency(credit)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Footer totals */}
              {sales.length > 0 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-between text-sm font-bold text-gray-700">
                  <span>Period Total ({sales.length} sales)</span>
                  <span className="text-blue-700">{formatCurrency(sales.reduce((s: number, sale: { totalAmount: number }) => s + sale.totalAmount, 0))}</span>
                </div>
              )}
            </div>

            {/* Payments History */}
            <div className="bg-white border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  Payment History
                  <span className="ml-2 text-sm font-normal text-gray-500">({payments.length})</span>
                </h2>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No payments in this period</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {payments.map((payment: any) => (
                    <div key={payment.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{formatDate(payment.createdAt)}</p>
                        <p className="text-xs text-gray-500 capitalize">{payment.method?.toLowerCase()}</p>
                      </div>
                      <p className="font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
              {payments.length > 0 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-between text-sm font-bold text-gray-700">
                  <span>Total Payments</span>
                  <span className="text-green-700">{formatCurrency(payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0))}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
