'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerSchema, CustomerFormData } from '@/types/form'

/**
 * Customer Form Component
 *
 * Form for creating and editing customers
 */

interface CustomerFormProps {
  initialData?: Partial<CustomerFormData>
  onSubmit: (data: CustomerFormData) => Promise<void>
  onCancel?: () => void
}

export function CustomerForm({
  initialData,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialData || {
      name: '',
      phone: '',
    },
  })

  const handleFormSubmit = async (data: CustomerFormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Customer Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Customer Name *
        </label>
        <input
          type="text"
          {...register('name')}
          placeholder="e.g., John Doe"
          className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Phone Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phone Number (Optional)
        </label>
        <input
          type="tel"
          {...register('phone')}
          placeholder="e.g., 0241234567"
          className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.phone && (
          <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting
            ? initialData
              ? 'Updating Customer...'
              : 'Creating Customer...'
            : initialData
            ? 'Update Customer'
            : 'Create Customer'}
        </button>
      </div>
    </form>
  )
}
