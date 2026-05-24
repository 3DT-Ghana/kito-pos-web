'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PaymentForm } from '@/components/forms/PaymentForm'
import { PaymentFormData } from '@/types/form'

/**
 * Record Customer Payment Page
 *
 * Form for recording a customer payment
 */

function RecordCustomerPaymentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedCustomerId = searchParams.get('customerId')

  const [customers, setCustomers] = useState<Array<{ id: string; name: string; balance: number }>>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers')
      if (!response.ok) throw new Error('Failed to fetch customers')
      const data = await response.json()

      // Filter customers with balance > 0
      const customersWithDebt = (data.customers || data.data || []).filter((c: { balance: number }) => c.balance > 0)
      setCustomers(customersWithDebt)
    } catch (error) {
      console.error('Error fetching customers:', error)
      alert('Failed to load customers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (data: PaymentFormData) => {
    try {
      const response = await fetch('/api/payments/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to record payment')
      }

      alert('Payment recorded successfully!')

      // If came from customer details page, go back there
      if (preselectedCustomerId) {
        router.push(`/customers/${preselectedCustomerId}`)
      } else {
        router.push('/payments')
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      alert(error instanceof Error ? error.message : 'Failed to record payment')
    }
  }

  const handleCancel = () => {
    if (preselectedCustomerId) {
      router.push(`/customers/${preselectedCustomerId}`)
    } else {
      router.push('/payments')
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Record Customer Payment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record a payment from a customer
          </p>
        </div>

        {/* No Debtors Warning */}
        {customers.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3">
            <p className="font-medium">No customers with outstanding balance</p>
            <p className="text-sm mt-1">
              All customers have cleared their balances or there are no customers yet.
            </p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <PaymentForm
            type="customer"
            entities={customers}
            preselectedId={preselectedCustomerId || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </AppLayout>
  )
}

export default function RecordCustomerPaymentPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    }>
      <RecordCustomerPaymentContent />
    </Suspense>
  )
}
