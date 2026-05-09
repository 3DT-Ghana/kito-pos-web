'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ItemForm } from '@/components/forms/ItemForm'
import { ItemFormData } from '@/types/form'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useUser } from '@/hooks/useUser'

/**
 * Item Detail Page
 *
 * Shows item info, stock level, recent sales/purchases history,
 * and provides edit, delete, and adjust quantity actions.
 */

export default function ItemDetailPage() {
  const router = useRouter()
  const params = useParams()
  const itemId = params.id as string
  const { user } = useUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [item, setItem] = useState<any>(null)
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; color: string | null; icon: string | null }[]>([])
  const [useUnitSystem, setUseUnitSystem] = useState(false)
  const [enableRetailPrice, setEnableRetailPrice] = useState(false)
  const [enableWholesalePrice, setEnableWholesalePrice] = useState(false)
  const [enablePromoPrice, setEnablePromoPrice] = useState(false)
  const [enableExpiryTracking, setEnableExpiryTracking] = useState(false)
  const [enablePosTerminal, setEnablePosTerminal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    Promise.all([fetchItem(), fetchManufacturers()])
  }, [itemId])

  useEffect(() => {
    if (!user?.tenantId) return
    fetch(`/api/tenants/${user.tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data?.useUnitSystem) setUseUnitSystem(true)
        if (data?.enableRetailPrice) setEnableRetailPrice(true)
        if (data?.enableWholesalePrice) setEnableWholesalePrice(true)
        if (data?.enablePromoPrice) setEnablePromoPrice(true)
        if (data?.enableExpiryTracking) setEnableExpiryTracking(true)
        if (data?.enablePosTerminal) setEnablePosTerminal(true)
      })
      .catch(() => {})
  }, [user?.tenantId])

  const fetchItem = async () => {
    try {
      const res = await fetch(`/api/items/${itemId}`)
      if (!res.ok) throw new Error('Failed to fetch item')
      const data = await res.json()
      setItem(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchManufacturers = async () => {
    try {
      const [mfRes, catRes] = await Promise.all([
        fetch('/api/manufacturers'),
        fetch('/api/categories'),
      ])
      if (mfRes.ok) {
        const data = await mfRes.json()
        setManufacturers(Array.isArray(data) ? data : data.data || [])
      }
      if (catRes.ok) setCategories(await catRes.json())
    } catch {}
  }

  const handleSubmit = async (data: ItemFormData) => {
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update item')
      }
      setIsEditing(false)
      fetchItem()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update item')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this item? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete item')
      }
      router.push('/items')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete item')
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-16">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    )
  }

  if (error || !item) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error || 'Item not found'}
        </div>
      </AppLayout>
    )
  }

  const stockStatus = item.quantity === 0
    ? { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
    : item.quantity <= 10
    ? { label: 'Low Stock', cls: 'bg-orange-100 text-orange-700' }
    : { label: 'In Stock', cls: 'bg-green-100 text-green-700' }

  const saleItems = item.saleItems || []
  const purchaseItems = item.purchaseItems || []

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/items')} className="p-2 hover:bg-gray-100 rounded-xl">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {item.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{item.name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stockStatus.cls}`}>
                  {stockStatus.label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {item.manufacturer?.name && (
                  <p className="text-sm text-gray-500">{item.manufacturer.name}</p>
                )}
                {item.category && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold text-white"
                    style={{ backgroundColor: item.category.color ?? '#6366f1' }}
                  >
                    {item.category.icon} {item.category.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          {!isEditing && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => router.push(`/items/${itemId}/adjust`)}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700"
              >
                ± Adjust Stock
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-2 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-2 bg-red-50 text-red-600 border-2 border-red-100 rounded-xl font-semibold text-sm hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`rounded-xl p-4 border-2 ${
            item.quantity === 0 ? 'bg-red-50 border-red-200'
            : item.quantity <= 10 ? 'bg-orange-50 border-orange-200'
            : 'bg-green-50 border-green-200'
          }`}>
            <p className="text-xs font-semibold text-gray-500 uppercase">In Stock</p>
            <p className={`text-2xl font-bold mt-1 ${
              item.quantity === 0 ? 'text-red-600'
              : item.quantity <= 10 ? 'text-orange-600'
              : 'text-green-700'
            }`}>{item.quantity}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Cost Price</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(item.costPrice)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Selling Price</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(item.sellingPrice)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Stock Value</p>
            <p className="text-xl font-bold text-indigo-600 mt-1">{formatCurrency(item.quantity * item.costPrice)}</p>
          </div>
          {item.expiryDate && (() => {
            const exp = new Date(item.expiryDate)
            const isExpired = exp < new Date()
            const isSoon = !isExpired && exp <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            return (
              <div className={`rounded-xl p-4 border-2 col-span-2 lg:col-span-1 ${isExpired ? 'bg-red-50 border-red-300' : isSoon ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-semibold uppercase ${isExpired ? 'text-red-500' : isSoon ? 'text-orange-500' : 'text-gray-500'}`}>Expiry Date</p>
                <p className={`text-lg font-bold mt-1 ${isExpired ? 'text-red-700' : isSoon ? 'text-orange-700' : 'text-gray-900'}`}>
                  {isExpired ? '⚠ ' : isSoon ? '⏰ ' : ''}{exp.toLocaleDateString()}
                </p>
                {isExpired && <p className="text-xs text-red-600 mt-0.5">This item has expired</p>}
                {isSoon && <p className="text-xs text-orange-600 mt-0.5">Expires within 30 days</p>}
              </div>
            )
          })()}
        </div>

        {/* Edit form */}
        {isEditing ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Item</h2>
            <ItemForm
              initialData={{
                manufacturerId: item.manufacturerId,
                name: item.name,
                quantity: item.quantity,
                costPrice: item.costPrice,
                sellingPrice: item.sellingPrice,
                unitName: item.unitName,
                piecesPerUnit: item.piecesPerUnit,
                retailPrice: item.retailPrice,
                wholesalePrice: item.wholesalePrice,
                promoPrice: item.promoPrice,
                expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : '',
                categoryId: item.categoryId ?? '',
              }}
              manufacturers={manufacturers}
              categories={categories}
              onSubmit={handleSubmit}
              onCancel={() => setIsEditing(false)}
              useUnitSystem={useUnitSystem}
              enableRetailPrice={enableRetailPrice}
              enableWholesalePrice={enableWholesalePrice}
              enablePromoPrice={enablePromoPrice}
              enableExpiryTracking={enableExpiryTracking}
              enablePosTerminal={enablePosTerminal}
            />
          </div>
        ) : (
          <>
            {/* Recent Sales */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  Recent Sales
                  <span className="ml-2 text-sm font-normal text-gray-400">({saleItems.length})</span>
                </h2>
              </div>
              {saleItems.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No sales recorded yet</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {saleItems.map((si: any) => (
                    <div key={si.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{formatDate(si.sale?.createdAt)}</p>
                        <p className="text-xs text-gray-400">#{si.sale?.id?.slice(0, 8)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{si.quantity} × {formatCurrency(si.price)}</p>
                        <p className="text-xs text-blue-600">{formatCurrency(si.quantity * si.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Purchases */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  Recent Purchases
                  <span className="ml-2 text-sm font-normal text-gray-400">({purchaseItems.length})</span>
                </h2>
              </div>
              {purchaseItems.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No purchases recorded yet</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {purchaseItems.map((pi: any) => (
                    <div key={pi.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{formatDate(pi.purchase?.createdAt)}</p>
                        <p className="text-xs text-gray-400">#{pi.purchase?.id?.slice(0, 8)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{pi.quantity} × {formatCurrency(pi.costPrice)}</p>
                        <p className="text-xs text-amber-600">{formatCurrency(pi.quantity * pi.costPrice)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
