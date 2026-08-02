'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SupplierForm } from '@/components/forms/SupplierForm'
import { SupplierFormData } from '@/types/form'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export default function SupplierDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const supplierId = params.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [supplier, setSupplier] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Date filter
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Toggle expanded purchases
  const [expandedPurchases, setExpandedPurchases] = useState<Set<string>>(new Set())

  useEffect(() => { fetchSupplier() }, [supplierId, startDate, endDate])

  const fetchSupplier = async () => {
    try {
      setIsLoading(true)
      const qp = new URLSearchParams()
      if (startDate) qp.set('startDate', startDate)
      if (endDate) qp.set('endDate', endDate)
      const response = await fetch(`/api/suppliers/${supplierId}?${qp}`)
      if (!response.ok) throw new Error('Failed to fetch supplier')
      const data = await response.json()
      setSupplier(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePurchase = (purchaseId: string) => {
    setExpandedPurchases(prev => {
      const next = new Set(prev)
      next.has(purchaseId) ? next.delete(purchaseId) : next.add(purchaseId)
      return next
    })
  }

  const handleSubmit = async (data: SupplierFormData) => {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update supplier')
      }
      setIsEditing(false)
      fetchSupplier()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update supplier')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this supplier? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete supplier')
      }
      router.push('/suppliers')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete supplier')
    }
  }

  if (isLoading && !supplier) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-16">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    )
  }

  if (error || !supplier) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error || 'Supplier not found'}
        </div>
      </AppLayout>
    )
  }

  const purchases = supplier.purchases || []
  const payments = supplier.payments || []
  const summary = supplier.summary || {}

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/suppliers')} className="p-2 hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-12 h-12 bg-amber-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{supplier.name}</h1>
              {supplier.phone && <p className="text-sm text-gray-500">{supplier.phone}</p>}
            </div>
          </div>
          {!isEditing && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => router.push(`/suppliers/${supplierId}/statement`)}
                className="px-3 py-2 bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700"
              >
                📄 Statement
              </button>
              <button
                onClick={() => router.push(`/payments/suppliers?supplierId=${supplierId}`)}
                className="px-3 py-2 bg-green-600 text-white font-semibold text-sm hover:bg-green-700"
              >
                💰 Record Payment
              </button>
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
          <div className={`p-4 border-2 ${supplier.balance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase">Balance Owed</p>
            <p className={`text-xl font-bold mt-1 ${supplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(supplier.balance)}
            </p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Purchases</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{supplier._count?.purchases || 0}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Purchase Value</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(summary.totalPurchases || 0)}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Paid</p>
            <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(summary.totalPaid || 0)}</p>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing ? (
          <div className="bg-white border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Supplier</h2>
            <SupplierForm
              initialData={{ name: supplier.name, phone: supplier.phone || '' }}
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
                    className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-gray-400 self-center text-sm">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-2 border-2 border-gray-200 text-sm focus:border-amber-500 focus:outline-none"
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

            {/* Purchases History */}
            <div className="bg-white border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">
                  Purchase History
                  <span className="ml-2 text-sm font-normal text-gray-500">({purchases.length} {startDate || endDate ? 'in period' : 'recent'})</span>
                </h2>
                {purchases.length > 0 && (
                  <button
                    onClick={() => setExpandedPurchases(expandedPurchases.size === purchases.length ? new Set() : new Set(purchases.map((p: { id: string }) => p.id)))}
                    className="text-xs text-amber-600 font-semibold hover:text-amber-800"
                  >
                    {expandedPurchases.size === purchases.length ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
              {purchases.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No purchases in this period</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {purchases.map((purchase: any) => {
                    const isExpanded = expandedPurchases.has(purchase.id)
                    const credit = purchase.totalAmount - purchase.paidAmount
                    return (
                      <div key={purchase.id}>
                        {/* Purchase row — clickable to toggle */}
                        <button
                          type="button"
                          onClick={() => togglePurchase(purchase.id)}
                          className="w-full px-5 py-3.5 text-left hover:bg-gray-50 flex items-center gap-3"
                        >
                          <span className={`text-gray-400 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{formatDate(purchase.createdAt)}</span>
                              <span className={`text-xs px-2 py-0.5 -full font-semibold ${
                                credit > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {credit > 0 ? 'Credit' : 'Paid'}
                              </span>
                              <span className="text-xs text-gray-400">#{purchase.id.slice(0, 8)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {purchase.items?.length || 0} item{purchase.items?.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-gray-900 text-sm">{formatCurrency(purchase.totalAmount)}</p>
                            {credit > 0 && <p className="text-xs text-red-600">Credit: {formatCurrency(credit)}</p>}
                          </div>
                        </button>

                        {/* Expanded item details */}
                        {isExpanded && (
                          <div className="px-5 pb-4 bg-amber-50 border-t border-amber-100">
                            <div className="pt-3 space-y-2">
                              <div className="grid grid-cols-3 text-xs font-bold text-gray-500 uppercase px-2 pb-1 border-b border-amber-200">
                                <span>Item</span>
                                <span className="text-center">Qty × Price</span>
                                <span className="text-right">Subtotal</span>
                              </div>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {purchase.items?.map((pi: any) => (
                                <div key={pi.id} className="grid grid-cols-3 text-sm px-2 py-1">
                                  <div>
                                    <p className="font-semibold text-gray-900">{pi.item?.name}</p>
                                    {pi.item?.manufacturer?.name && (
                                      <p className="text-xs text-amber-700">{pi.item.manufacturer.name}</p>
                                    )}
                                  </div>
                                  <p className="text-center text-gray-600">{pi.quantity} × {formatCurrency(pi.costPrice)}</p>
                                  <p className="text-right font-semibold text-gray-900">{formatCurrency(pi.quantity * pi.costPrice)}</p>
                                </div>
                              ))}
                              <div className="grid grid-cols-3 text-sm px-2 pt-2 border-t border-amber-200 font-bold">
                                <span className="text-gray-700">Total</span>
                                <span />
                                <span className="text-right text-gray-900">{formatCurrency(purchase.totalAmount)}</span>
                              </div>
                              <div className="grid grid-cols-3 text-sm px-2 font-semibold">
                                <span className="text-green-700">Paid</span>
                                <span />
                                <span className="text-right text-green-700">{formatCurrency(purchase.paidAmount)}</span>
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
              {purchases.length > 0 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-between text-sm font-bold text-gray-700">
                  <span>Period Total ({purchases.length} purchases)</span>
                  <span className="text-amber-700">{formatCurrency(purchases.reduce((s: number, p: { totalAmount: number }) => s + p.totalAmount, 0))}</span>
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
