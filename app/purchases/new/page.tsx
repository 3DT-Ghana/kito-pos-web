'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PurchaseForm } from '@/components/forms/PurchaseForm'

export default function NewPurchasePage() {
  const router = useRouter()
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (data: unknown) => {
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create purchase')
    }

    setIsSuccess(true)
  }

  const handleCancel = () => router.push('/purchases')

  if (isSuccess) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Recorded!</h2>
          <p className="text-gray-600 mb-8">The purchase was recorded and inventory updated.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setIsSuccess(false)}
              className="px-6 py-3 bg-green-600 text-white font-bold hover:bg-green-700 transition-colors"
            >
              Record Another
            </button>
            <button
              onClick={() => router.push('/purchases')}
              className="px-6 py-3 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
            >
              View All Purchases
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Purchase</h1>
            <p className="text-sm text-gray-500">Record a new purchase transaction</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white shadow-sm border border-gray-200 p-5 md:p-6">
          <PurchaseForm onSubmit={handleSubmit} onCancel={handleCancel} />
        </div>
      </div>
    </AppLayout>
  )
}
