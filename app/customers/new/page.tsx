'use client'

import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { CustomerFormData } from '@/types/form'

/**
 * New Customer Page
 *
 * Form for creating a new customer
 */

export default function NewCustomerPage() {
  const router = useRouter()

  const handleSubmit = async (data: CustomerFormData) => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create customer')
      }

      alert('Customer created successfully!')
      router.push('/customers')
    } catch (error) {
      console.error('Error creating customer:', error)
      alert(error instanceof Error ? error.message : 'Failed to create customer')
    }
  }

  const handleCancel = () => {
    router.push('/customers')
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Customer</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a new customer
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <CustomerForm onSubmit={handleSubmit} onCancel={handleCancel} />
        </div>
      </div>
    </AppLayout>
  )
}
