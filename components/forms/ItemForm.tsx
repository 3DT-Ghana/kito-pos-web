'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { itemSchema, ItemFormData } from '@/types/form'
import { formatCurrency } from '@/lib/utils/format'
import { isInventoryItemType, itemTypeLabel, normalizeItemType } from '@/lib/items/type'
import { DEFAULT_REORDER_LEVEL } from '@/lib/items/stock'

/**
 * Item Form Component
 *
 * Form for creating and editing items
 */

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface TaxRateOption {
  id: string
  name: string
  ratePercentage: number
  description: string | null
}

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
  enableAccounting?: boolean
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
  enableAccounting = false,
}: ItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [coaAccounts, setCoaAccounts] = useState<Account[]>([])
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [defaultTaxCalculationType, setDefaultTaxCalculationType] = useState<
    'ADD_TO_PRICE' | 'INCLUSIVE'
  >('ADD_TO_PRICE')
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([])

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
    defaultValues: {
      manufacturerId: '',
      name: '',
      quantity: 0,
      reorderLevel: DEFAULT_REORDER_LEVEL,
      costPrice: 0,
      sellingPrice: 0,
      itemType: 'INVENTORY',
      isTaxable: false,
      useTenantDefaultTaxes: true,
      taxRateIds: [],
      ...initialData,
    },
  })

  const itemType = normalizeItemType(watch('itemType'))
  const isInventoryItem = isInventoryItemType(itemType)
  const isTaxable = watch('isTaxable') ?? false
  const useTenantDefaultTaxes = watch('useTenantDefaultTaxes') ?? true
  const selectedTaxRateIds = watch('taxRateIds') ?? []
  const costPrice = watch('costPrice') || 0
  const sellingPrice = watch('sellingPrice') || 0
  const profit = sellingPrice - costPrice
  const profitMargin = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(1) : '0'

  // Fetch COA accounts when accounting is enabled
  useEffect(() => {
    if (!enableAccounting) return
    fetch('/api/accounting/accounts?activeOnly=true')
      .then(r => r.json())
      .then(d => setCoaAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [enableAccounting])

  useEffect(() => {
    Promise.all([
      fetch('/api/tax/settings'),
      fetch('/api/tax/rates?activeOnly=true'),
    ])
      .then(async ([settingRes, ratesRes]) => {
        if (settingRes.ok) {
          const settingData = await settingRes.json()
          setTaxEnabled(Boolean(settingData.taxSetting?.taxEnabled))
          setDefaultTaxCalculationType(
            settingData.taxSetting?.defaultTaxCalculationType === 'INCLUSIVE'
              ? 'INCLUSIVE'
              : 'ADD_TO_PRICE'
          )
        }

        if (ratesRes.ok) {
          const ratesData = await ratesRes.json()
          setTaxRates(ratesData.taxRates ?? [])
        }
      })
      .catch(() => {})
  }, [])

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

  const toggleTaxRateSelection = (taxRateId: string) => {
    const current = selectedTaxRateIds ?? []
    const next = current.includes(taxRateId)
      ? current.filter((id) => id !== taxRateId)
      : [...current, taxRateId]

    setValue('taxRateIds', next)
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
          className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Item Type */}
      <div className="border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Item Type</label>
          <select
            {...register('itemType')}
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
          >
            <option value="INVENTORY">Inventory Item — tracks stock, value, COGS</option>
            <option value="NON_INVENTORY">Non-Inventory — sell/buy without stock tracking</option>
            <option value="SERVICE">Service — no stock tracking, invoices only</option>
          </select>
        </div>
        <p className="text-xs text-slate-600">
          {isInventoryItem
            ? 'Inventory items affect stock counts, low-stock alerts, inventory valuation, and cost of goods sold.'
            : `${itemTypeLabel(itemType)} items stay in your catalog but do not use stock quantities or inventory valuation.`}
        </p>
      </div>

      {/* Initial Quantity / Stock Tracking */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {isInventoryItem ? 'Initial Quantity' : 'Stock Tracking'}
        </label>
        {isInventoryItem ? (
          <>
            <input
              type="number"
              {...register('quantity', { valueAsNumber: true })}
              placeholder="0"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-red-600">{errors.quantity.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Leave blank or set to 0 if adding via purchase
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reorder Level
              </label>
              <input
                type="number"
                {...register('reorderLevel', { valueAsNumber: true })}
                placeholder={String(DEFAULT_REORDER_LEVEL)}
                min="0"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.reorderLevel && (
                <p className="mt-1 text-sm text-red-600">{errors.reorderLevel.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Low-stock alerts appear when quantity is at or below this level.
              </p>
            </div>
          </>
        ) : (
          <>
            <input type="hidden" {...register('quantity', { valueAsNumber: true })} />
            <div className="border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Stock quantity is not tracked for {itemTypeLabel(itemType).toLowerCase()} items.
            </div>
          </>
        )}
      </div>

      {/* Unit System Fields */}
      {useUnitSystem && (
        <div className="bg-amber-50 border-2 border-amber-200 p-4 space-y-4">
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
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  autoComplete="off"
                />
                {showUnitDropdown && (filteredUnitNames.length > 0 || isNewUnitName) && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 shadow-lg overflow-hidden">
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
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {errors.sellingPrice && (
            <p className="mt-1 text-sm text-red-600">{errors.sellingPrice.message}</p>
          )}
        </div>
      </div>

      {/* Additional Price Tiers */}
      {(enableRetailPrice || enableWholesalePrice || enablePromoPrice) && (
        <div className="bg-blue-50 border-2 border-blue-200 p-4 space-y-3">
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
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
        <div className="bg-blue-50 p-4 space-y-2">
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

      {/* Tax Configuration */}
      <div className="border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-emerald-900">Tax Configuration</h3>
            <p className="mt-1 text-xs text-emerald-800">
              Control whether this item is taxable and whether it uses the tenant default tax bundle or specific named taxes.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 -full bg-white px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm">
            <input
              type="checkbox"
              checked={isTaxable}
              onChange={(event) => setValue('isTaxable', event.target.checked)}
              className="h-4 w-4  border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Taxable
          </label>
        </div>

        {!taxEnabled ? (
          <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Tenant tax is currently disabled. You can still prepare product tax settings here, and they will start applying once tax is enabled in Settings.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Calculation Type
              </label>
              <select
                {...register('taxCalculationType', {
                  setValueAs: (value) => value || undefined,
                })}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">
                  Use tenant default ({defaultTaxCalculationType === 'INCLUSIVE' ? 'Tax Inclusive / Reverse Tax' : 'Tax Added to Price'})
                </option>
                <option value="ADD_TO_PRICE">Tax Added to Price</option>
                <option value="INCLUSIVE">Tax Inclusive / Reverse Tax</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Leave this on the tenant default unless this item needs a different tax treatment.
              </p>
            </div>

            <label className="flex items-start gap-3 border border-gray-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={useTenantDefaultTaxes}
                onChange={(event) => setValue('useTenantDefaultTaxes', event.target.checked)}
                className="mt-0.5 h-4 w-4  border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900">Use tenant default taxes</span>
                <p className="mt-1 text-xs text-gray-500">
                  Turn this off only when this item needs its own tax names or custom bundle.
                </p>
              </div>
            </label>

            {!useTenantDefaultTaxes && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Specific Taxes for This Item
                  </label>
                  {taxRates.length === 0 ? (
                    <div className="border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">
                      No active tax rates found. Create tax rates in Settings first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {taxRates.map((taxRate) => (
                        <label
                          key={taxRate.id}
                          className="flex items-start gap-3 border border-gray-200 bg-white px-4 py-3 hover:border-emerald-300"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTaxRateIds.includes(taxRate.id)}
                            onChange={() => toggleTaxRateSelection(taxRate.id)}
                            className="mt-0.5 h-4 w-4  border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {taxRate.name}
                              </span>
                              <span className="-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                {taxRate.ratePercentage}%
                              </span>
                            </div>
                            {taxRate.description && (
                              <p className="mt-1 text-xs text-gray-500">{taxRate.description}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Multiple taxes can be selected for the same item. They will be calculated separately and shown as a breakdown on invoices and reports.
                </p>
              </div>
            )}
          </>
        )}
      </div>

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
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
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
            className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">Leave blank if this item does not expire</p>
        </div>
      )}

      {/* Accounting — Account Mapping */}
      {enableAccounting && (
        <div className="border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
          <h3 className="text-sm font-bold text-indigo-800">Accounting Mappings</h3>

          {/* Account selectors */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Income / Sales Account</label>
              <select
                {...register('incomeAccountId')}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="">Default (Sales Revenue 4100)</option>
                {coaAccounts.filter(a => a.type === 'REVENUE').map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">COGS Account</label>
              <select
                {...register('cogsAccountId')}
                disabled={!isInventoryItem}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="">Default (COGS 5100)</option>
                {coaAccounts.filter(a => a.type === 'COGS').map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Only used for inventory items.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Expense Account (for bills)</label>
              <select
                {...register('expenseAccountId')}
                disabled={isInventoryItem}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="">None</option>
                {coaAccounts.filter(a => a.type === 'EXPENSE').map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Used when non-inventory or service items are purchased.
              </p>
            </div>
          </div>
        </div>
      )}

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
