'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { itemSchema, ItemFormData } from '@/types/form'
import { formatCurrency } from '@/lib/utils/format'

/**
 * Item Form Component
 *
 * Form for creating and editing items
 */

interface ItemFormProps {
  initialData?: Partial<ItemFormData>
  manufacturers: { id: string; name: string }[]
  categories?: { id: string; name: string; color: string | null; icon: string | null }[]
  onSubmit: (data: ItemFormData) => Promise<void>
  onCancel?: () => void
  useUnitSystem?: boolean
  enableRetailPrice?: boolean
  enableWholesalePrice?: boolean
  enablePromoPrice?: boolean
  enableExpiryTracking?: boolean
  enablePosTerminal?: boolean
}

export function ItemForm({
  initialData,
  manufacturers,
  categories = [],
  onSubmit,
  onCancel,
  useUnitSystem = false,
  enableRetailPrice = false,
  enableWholesalePrice = false,
  enablePromoPrice = false,
  enableExpiryTracking = false,
  enablePosTerminal = false,
}: ItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Unit name combobox state
  const [existingUnitNames, setExistingUnitNames] = useState<string[]>([])
  const [unitNameInput, setUnitNameInput] = useState(initialData?.unitName ?? '')
  const [showUnitDropdown, setShowUnitDropdown] = useState(false)
  const unitNameRef = useRef<HTMLDivElement>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: initialData || {
      manufacturerId: '',
      name: '',
      quantity: 0,
      costPrice: 0,
      sellingPrice: 0,
    },
  })

  const costPrice = watch('costPrice') || 0
  const sellingPrice = watch('sellingPrice') || 0
  const profit = sellingPrice - costPrice
  const profitMargin = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(1) : '0'

  // Fetch existing unit names when unit system section is shown
  useEffect(() => {
    if (!useUnitSystem) return
    fetch('/api/items?unitNames=true')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setExistingUnitNames(data) })
      .catch(() => {})
  }, [useUnitSystem])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (unitNameRef.current && !unitNameRef.current.contains(e.target as Node)) {
        setShowUnitDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredUnitNames = unitNameInput.trim()
    ? existingUnitNames.filter(u => u.toLowerCase().includes(unitNameInput.toLowerCase()))
    : existingUnitNames

  const isNewUnitName =
    unitNameInput.trim().length > 0 &&
    !existingUnitNames.some(u => u.toLowerCase() === unitNameInput.trim().toLowerCase())

  const selectUnitName = (name: string) => {
    setUnitNameInput(name)
    setValue('unitName', name)
    setShowUnitDropdown(false)
  }

  const confirmNewUnitName = () => {
    const trimmed = unitNameInput.trim()
    if (!trimmed) return
    setExistingUnitNames(prev => [...prev, trimmed].sort())
    setValue('unitName', trimmed)
    setShowUnitDropdown(false)
  }

  const handleFormSubmit = async (data: ItemFormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Manufacturer Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Manufacturer *
        </label>
        <select
          {...register('manufacturerId')}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select Manufacturer</option>
          {manufacturers.map((manufacturer) => (
            <option key={manufacturer.id} value={manufacturer.id}>
              {manufacturer.name}
            </option>
          ))}
        </select>
        {errors.manufacturerId && (
          <p className="mt-1 text-sm text-red-600">{errors.manufacturerId.message}</p>
        )}
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            {...register('categoryId')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">No Category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Item Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Item Name *
        </label>
        <input
          type="text"
          {...register('name')}
          placeholder="e.g., Coca Cola 500ml"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Initial Quantity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Initial Quantity
        </label>
        <input
          type="number"
          {...register('quantity', { valueAsNumber: true })}
          placeholder="0"
          min="0"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.quantity && (
          <p className="mt-1 text-sm text-red-600">{errors.quantity.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Leave blank or set to 0 if adding via purchase
        </p>
      </div>

      {/* Unit System Fields */}
      {useUnitSystem && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <div>
              <p className="font-semibold text-amber-900 text-sm">Unit System</p>
              <p className="text-xs text-amber-700">Define the unit name and how many pieces make up one unit.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Unit Name combobox */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Name
              </label>
              {/* Hidden RHF field */}
              <input type="hidden" {...register('unitName')} />
              <div ref={unitNameRef} className="relative">
                <input
                  type="text"
                  value={unitNameInput}
                  onChange={e => {
                    setUnitNameInput(e.target.value)
                    setValue('unitName', e.target.value)
                    setShowUnitDropdown(true)
                  }}
                  onFocus={() => setShowUnitDropdown(true)}
                  placeholder="e.g. carton, bag, box"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  autoComplete="off"
                />
                {showUnitDropdown && (filteredUnitNames.length > 0 || isNewUnitName) && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {filteredUnitNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectUnitName(name) }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-amber-600">📦</span>
                        <span className="font-medium text-gray-800">{name}</span>
                        <span className="ml-auto text-xs text-gray-400">existing</span>
                      </button>
                    ))}
                    {isNewUnitName && (
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); confirmNewUnitName() }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 flex items-center gap-2 bg-green-50/50"
                      >
                        <span className="text-green-600">✚</span>
                        <span className="font-semibold text-green-800">
                          Use &ldquo;{unitNameInput.trim()}&rdquo;
                        </span>
                        <span className="ml-auto text-xs text-green-600 font-medium">new</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {errors.unitName && (
                <p className="mt-1 text-sm text-red-600">{errors.unitName.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">The outer unit (e.g. &quot;carton&quot;)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pieces per Unit
              </label>
              <input
                type="number"
                {...register('piecesPerUnit', { valueAsNumber: true })}
                placeholder="e.g. 12"
                min="1"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              {errors.piecesPerUnit && (
                <p className="mt-1 text-sm text-red-600">{errors.piecesPerUnit.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">How many pieces in one unit</p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Section */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cost Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost Price *
          </label>
          <input
            type="number"
            {...register('costPrice', { valueAsNumber: true })}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {errors.costPrice && (
            <p className="mt-1 text-sm text-red-600">{errors.costPrice.message}</p>
          )}
        </div>

        {/* Selling Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Selling Price *
          </label>
          <input
            type="number"
            {...register('sellingPrice', { valueAsNumber: true })}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {errors.sellingPrice && (
            <p className="mt-1 text-sm text-red-600">{errors.sellingPrice.message}</p>
          )}
        </div>
      </div>

      {/* Additional Price Tiers */}
      {(enableRetailPrice || enableWholesalePrice || enablePromoPrice) && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <p className="font-semibold text-blue-900 text-sm">Additional Price Tiers</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {enableRetailPrice && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🛒 Retail Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  {...register('retailPrice', { valueAsNumber: true })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.retailPrice && (
                  <p className="mt-1 text-sm text-red-600">{errors.retailPrice.message}</p>
                )}
              </div>
            )}
            {enableWholesalePrice && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📦 Wholesale Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  {...register('wholesalePrice', { valueAsNumber: true })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.wholesalePrice && (
                  <p className="mt-1 text-sm text-red-600">{errors.wholesalePrice.message}</p>
                )}
              </div>
            )}
            {enablePromoPrice && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🏷️ Promo Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  {...register('promoPrice', { valueAsNumber: true })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.promoPrice && (
                  <p className="mt-1 text-sm text-red-600">{errors.promoPrice.message}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profit Calculation */}
      {costPrice > 0 && sellingPrice > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Profit per Unit:</span>
            <span className={`text-lg font-bold ${profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(profit)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Profit Margin:</span>
            <span className={`text-lg font-bold ${profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profitMargin}%
            </span>
          </div>
        </div>
      )}

      {/* Barcode (shown when POS Terminal is enabled) */}
      {enablePosTerminal && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Barcode / SKU <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            {...register('barcode')}
            placeholder="e.g. 6001234567890"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">Used for barcode scanning in the POS terminal</p>
        </div>
      )}

      {/* Expiry Date (shown when Expiry Tracking is enabled) */}
      {enableExpiryTracking && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="date"
            {...register('expiryDate')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">Leave blank if this item does not expire</p>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting
            ? initialData
              ? 'Updating Item...'
              : 'Creating Item...'
            : initialData
            ? 'Update Item'
            : 'Create Item'}
        </button>
      </div>
    </form>
  )
}
