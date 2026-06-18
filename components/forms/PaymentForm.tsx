'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { paymentSchema, PaymentFormData } from '@/types/form'
import { formatCurrency } from '@/lib/utils/format'

interface PaymentFormProps {
  type: 'customer' | 'supplier'
  entities: Array<{ id: string; name: string; balance: number }>
  onSubmit: (data: PaymentFormData) => Promise<void>
  onCancel?: () => void
  preselectedId?: string
}

export function PaymentForm({ type, entities, onSubmit, onCancel, preselectedId }: PaymentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Search state
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; name: string; balance: number } | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const label = type === 'customer' ? 'Customer' : 'Supplier'
  const fieldName: keyof PaymentFormData = type === 'customer' ? 'customerId' : 'supplierId'

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: undefined,
      method: 'CASH',
    },
  })

  // Pre-select entity if id provided
  useEffect(() => {
    if (preselectedId) {
      const found = entities.find(e => e.id === preselectedId)
      if (found) {
        setSelectedEntity(found)
        setValue(fieldName, found.id)
      }
    }
  }, [preselectedId, entities])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredEntities = search.trim()
    ? entities.filter(e => e.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : entities.slice(0, 8)

  const amount = watch('amount') || 0

  const handleSelect = (entity: typeof entities[0]) => {
    setSelectedEntity(entity)
    setValue(fieldName, entity.id)
    setSearch('')
    setShowDropdown(false)
  }

  const handleFormSubmit = async (data: PaymentFormData) => {
    if (!selectedEntity) {
      setFormError(`Please select a ${label.toLowerCase()}`)
      return
    }
    setIsSubmitting(true)
    setFormError('')
    try {
      await onSubmit(data)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">

      {/* Hidden field */}
      <input type="hidden" {...register(fieldName)} />

      {/* Entity Search */}
      <div ref={searchRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {label} <span className="text-red-500">*</span>
        </label>

        {selectedEntity ? (
          <div className={`flex items-center gap-3 px-4 py-3 border-2 ${
            type === 'customer' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
          }`}>
            <div className={`w-10 h-10 flex items-center justify-center text-white font-bold text-lg shrink-0 ${
              type === 'customer' ? 'bg-blue-600' : 'bg-green-600'
            }`}>
              {selectedEntity.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{selectedEntity.name}</p>
              <p className={`text-sm font-semibold ${selectedEntity.balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                {selectedEntity.balance > 0
                  ? `Owes: ${formatCurrency(selectedEntity.balance)}`
                  : 'No outstanding balance'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedEntity(null)
                setValue(fieldName, '')
                setSearch('')
              }}
              className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0"
            >
              ×
            </button>
          </div>
        ) : (
          <div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={`Search ${label.toLowerCase()} by name...`}
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
              />
            </div>
            {showDropdown && filteredEntities.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                {filteredEntities.map(entity => (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => handleSelect(entity)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-0"
                  >
                    <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm shrink-0 ${
                      entity.balance > 0
                        ? type === 'customer' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {entity.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{entity.name}</p>
                      {entity.balance > 0 && (
                        <p className="text-xs text-red-500">Balance: {formatCurrency(entity.balance)}</p>
                      )}
                    </div>
                    {entity.balance === 0 && (
                      <span className="text-xs text-green-600 font-semibold shrink-0">Cleared</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && search.trim() && filteredEntities.length === 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl p-4 text-center text-sm text-gray-500">
                No {label.toLowerCase()}s found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Warning if entity has no balance */}
      {selectedEntity && selectedEntity.balance === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm font-medium">
          ⚠ This {label.toLowerCase()} has no outstanding balance
        </div>
      )}

      {/* Payment Amount */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Payment Amount (GH₵) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          {...register('amount', { valueAsNumber: true })}
          placeholder="0.00"
          step="0.01"
          min="0.01"
          max={selectedEntity?.balance}
          className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-xl font-bold"
        />
        {errors.amount && (
          <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
        )}
        {selectedEntity && selectedEntity.balance > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Maximum: {formatCurrency(selectedEntity.balance)}
          </p>
        )}
      </div>

      {/* Balance Preview */}
      {selectedEntity && selectedEntity.balance > 0 && amount > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-100 p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Current Balance</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(selectedEntity.balance)}</p>
          </div>
          <div className="bg-green-50 border border-green-100 p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">After Payment</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(Math.max(0, selectedEntity.balance - amount))}
            </p>
          </div>
        </div>
      )}

      {/* Payment Method */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">
          Payment Method <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['CASH', 'MOMO', 'BANK'] as const).map(method => (
            <label
              key={method}
              className={`flex items-center justify-center gap-2 py-3 border-2 cursor-pointer font-semibold text-sm transition-all ${
                watch('method') === method
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              <input type="radio" value={method} {...register('method')} className="sr-only" />
              <span>{method === 'CASH' ? '💵' : method === 'MOMO' ? '📱' : '🏦'}</span>
              <span>{method === 'CASH' ? 'Cash' : method === 'MOMO' ? 'Mobile Money' : 'Bank'}</span>
            </label>
          ))}
        </div>
        {errors.method && (
          <p className="mt-1 text-sm text-red-600">{errors.method.message}</p>
        )}
        {watch('method') === 'MOMO' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              MoMo Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              placeholder="e.g. 0244123456"
              {...register('momoPhone')}
              className="w-full px-3 py-2.5 border-2 border-blue-200 focus:border-blue-500 focus:outline-none text-sm"
            />
            {errors.momoPhone && (
              <p className="mt-1 text-sm text-red-600">{errors.momoPhone.message}</p>
            )}
          </div>
        )}
        {watch('method') === 'BANK' && (
          <div className="space-y-2 border border-blue-100 bg-blue-50/50 p-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Bank Name</label>
              <input
                type="text"
                placeholder="e.g. GCB Bank, Ecobank, Fidelity"
                {...register('bankName')}
                className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Account Holder Name</label>
              <input
                type="text"
                placeholder="Name on the bank account"
                {...register('bankAccountName')}
                className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Transaction / Reference No.</label>
              <input
                type="text"
                placeholder="Bank transaction or reference number"
                {...register('bankReference')}
                className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
          ⚠ {formError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !selectedEntity || selectedEntity.balance === 0}
          className="flex-1 py-4 bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
        >
          {isSubmitting ? 'Recording...' : `Record Payment — ${formatCurrency(amount)}`}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-28 py-4 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
