'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PaymentForm } from '@/components/forms/PaymentForm'
import { PaymentFormData } from '@/types/form'

/**
 * Record Supplier Payment Page
 *
 * Form for recording a supplier payment
 */

function RecordSupplierPaymentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedSupplierId = searchParams.get('supplierId')

  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; balance: number }>>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers')
      if (!response.ok) throw new Error('Failed to fetch suppliers')
      const data = await response.json()

      // Filter suppliers with balance > 0
      const suppliersWithCredit = (data.suppliers || data.data || []).filter((s: { balance: number }) => s.balance > 0)
      setSuppliers(suppliersWithCredit)
    } catch (error) {
      console.error('Error fetching suppliers:', error)
      alert('Failed to load suppliers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (data: PaymentFormData) => {
    try {
      const response = await fetch('/api/payments/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to record payment')
      }

      alert('Payment recorded successfully!')

      // If came from supplier details page, go back there
      if (preselectedSupplierId) {
        router.push(`/suppliers/${preselectedSupplierId}`)
      } else {
        router.push('/payments')
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      alert(error instanceof Error ? error.message : 'Failed to record payment')
    }
  }

  const handleCancel = () => {
    if (preselectedSupplierId) {
      router.push(`/suppliers/${preselectedSupplierId}`)
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
          <h1 className="text-2xl font-bold text-gray-900">Record Supplier Payment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record a payment to a supplier
          </p>
        </div>

        {/* No Creditors Warning */}
        {suppliers.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3">
            <p className="font-medium">No suppliers with outstanding balance</p>
            <p className="text-sm mt-1">
              All suppliers have been paid or there are no suppliers yet.
            </p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <PaymentForm
            type="supplier"
            entities={suppliers}
            preselectedId={preselectedSupplierId || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </AppLayout>
  )
}

export default function RecordSupplierPaymentPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RecordSupplierPaymentPageContent />
    </Suspense>
  )
}
