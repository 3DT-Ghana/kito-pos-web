'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'

/**
 * New Manufacturer Page
 *
 * Form for creating a new manufacturer
 */

export default function NewManufacturerPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Brand / Manufacturer name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create manufacturer')
      }

      alert('Manufacturer created successfully!')
      router.push('/manufacturers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create manufacturer')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Brand / Manufacturer</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a new product brand or manufacturer
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3">
                {error}
              </div>
            )}

            {/* Manufacturer Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand / Manufacturer Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Coca Cola Company"
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSubmitting}
              />
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <button
                type="button"
                onClick={() => router.push('/manufacturers')}
                disabled={isSubmitting}
                className="px-6 py-2 border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Brand / Manufacturer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
