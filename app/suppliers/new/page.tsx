'use client'

import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SupplierForm } from '@/components/forms/SupplierForm'
import { SupplierFormData } from '@/types/form'

/**
 * New Supplier Page
 *
 * Form for creating a new supplier
 */

export default function NewSupplierPage() {
  const router = useRouter()

  const handleSubmit = async (data: SupplierFormData) => {
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create supplier')
      }

      alert('Supplier created successfully!')
      router.push('/suppliers')
    } catch (error) {
      console.error('Error creating supplier:', error)
      alert(error instanceof Error ? error.message : 'Failed to create supplier')
    }
  }

  const handleCancel = () => {
    router.push('/suppliers')
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Supplier</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a new supplier
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <SupplierForm onSubmit={handleSubmit} onCancel={handleCancel} />
        </div>
      </div>
    </AppLayout>
  )
}
