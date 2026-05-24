'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ItemForm } from '@/components/forms/ItemForm'
import { ItemFormData } from '@/types/form'
import { useUser } from '@/hooks/useUser'

/**
 * New Item Page
 *
 * Form for creating a new item
 */

export default function NewItemPage() {
  const router = useRouter()
  const { user } = useUser()
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; color: string | null; icon: string | null }[]>([])
  const [useUnitSystem, setUseUnitSystem] = useState(false)
  const [enableRetailPrice, setEnableRetailPrice] = useState(false)
  const [enableWholesalePrice, setEnableWholesalePrice] = useState(false)
  const [enablePromoPrice, setEnablePromoPrice] = useState(false)
  const [enableExpiryTracking, setEnableExpiryTracking] = useState(false)
  const [enablePosTerminal, setEnablePosTerminal] = useState(false)
  const [enableAccounting, setEnableAccounting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/manufacturers').then(r => r.json()),
      user?.tenantId ? fetch(`/api/tenants/${user.tenantId}`).then(r => r.json()) : Promise.resolve(null),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([mfData, tenantData, catData]) => {
      setManufacturers(Array.isArray(mfData) ? mfData : mfData.data || [])
      if (Array.isArray(catData)) setCategories(catData)
      if (tenantData?.useUnitSystem) setUseUnitSystem(true)
      if (tenantData?.enableRetailPrice) setEnableRetailPrice(true)
      if (tenantData?.enableWholesalePrice) setEnableWholesalePrice(true)
      if (tenantData?.enablePromoPrice) setEnablePromoPrice(true)
      if (tenantData?.enableExpiryTracking) setEnableExpiryTracking(true)
      if (tenantData?.enablePosTerminal) setEnablePosTerminal(true)
      if (tenantData?.enableAccounting) setEnableAccounting(true)
    }).catch(() => {
      alert('Failed to load data')
    }).finally(() => setIsLoading(false))
  }, [user?.tenantId])

  const handleSubmit = async (data: ItemFormData) => {
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create item')
      }

      alert('Item created successfully!')
      router.push('/items')
    } catch (error) {
      console.error('Error creating item:', error)
      alert(error instanceof Error ? error.message : 'Failed to create item')
    }
  }

  const handleCancel = () => {
    router.push('/items')
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
          <h1 className="text-2xl font-bold text-gray-900">New Item</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add a new inventory, non-inventory, or service item
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-sm border border-gray-200 p-6">
          <ItemForm
            manufacturers={manufacturers}
            categories={categories}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            useUnitSystem={useUnitSystem}
            enableRetailPrice={enableRetailPrice}
            enableWholesalePrice={enableWholesalePrice}
            enablePromoPrice={enablePromoPrice}
            enableExpiryTracking={enableExpiryTracking}
            enablePosTerminal={enablePosTerminal}
            enableAccounting={enableAccounting}
          />
        </div>
      </div>
    </AppLayout>
  )
}
