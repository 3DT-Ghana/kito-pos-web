'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { paymentSchema, PaymentFormData } from '@/types/form'
import { formatCurrency } from '@/lib/utils/format'
import { MomoPhoneModal } from '@/components/modals/MomoPhoneModal'
import type { MomoChannel } from '@/lib/momo/hubtelVerify'
import { useTenantFeatures } from '@/hooks/useTenant'

type PaymentMethod = 'CASH' | 'MOMO' | 'BANK'
type MomoStatus = 'idle' | 'sending' | 'pending' | 'success' | 'failed'

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

  // Entity search
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; name: string; balance: number } | null>(null)

  // Payment method & split
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [splitMode, setSplitMode] = useState(false)
  const [momoPhone, setMomoPhone] = useState('')
  // Required by Hubtel on every payment request.
  const [momoChannel, setMomoChannel] = useState<MomoChannel>('mtn-gh')
  const [splitMomoAmount, setSplitMomoAmount] = useState('')
  const [splitCashAmount, setSplitCashAmount] = useState('')

  // MoMo prompt status
  const [momoStatus, setMomoStatus] = useState<MomoStatus>('idle')
  const [momoError, setMomoError] = useState('')
  const [momoPhoneModalOpen, setMomoPhoneModalOpen] = useState(false)

  const label = type === 'customer' ? 'Customer' : 'Supplier'
  const fieldName: keyof PaymentFormData = type === 'customer' ? 'customerId' : 'supplierId'

  // When off, MoMo is recorded manually: no prompt is sent and no approval is
  // awaited, because the business has no payment gateway to send one through.
  const { features } = useTenantFeatures()
  const momoCollectEnabled = features.enableMomoCollect

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: undefined, method: 'CASH' },
  })

  const amount = watch('amount') || 0
  const splitMomoNum = parseFloat(splitMomoAmount) || 0
  const splitCashNum = parseFloat(splitCashAmount) || 0
  const splitReady = splitMode && Math.abs(splitMomoNum + splitCashNum - amount) < 0.01 && splitMomoNum > 0 && splitCashNum > 0

  // Pre-select entity if id provided
  useEffect(() => {
    if (preselectedId) {
      const found = entities.find(e => e.id === preselectedId)
      if (found) {
        setSelectedEntity(found)
        setValue(fieldName, found.id)
      }
    }
  }, [preselectedId, entities]) // eslint-disable-line react-hooks/exhaustive-deps

  // No global mousedown listener needed — dropdown closes via onBlur on the search input

  // Auto-fill cash portion when momo amount changes in split mode
  useEffect(() => {
    if (splitMode && amount > 0 && splitMomoNum > 0) {
      const cash = amount - splitMomoNum
      setSplitCashAmount(cash > 0 ? cash.toFixed(2) : '')
    }
  }, [splitMomoAmount, splitMode, amount]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEntities = search.trim()
    ? entities.filter(e => e.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : entities.slice(0, 8)

  const handleSelect = (entity: typeof entities[0]) => {
    setSelectedEntity(entity)
    setValue(fieldName, entity.id)
    setSearch('')
    setShowDropdown(false)
  }

  const handleMethodChange = (m: PaymentMethod) => {
    setMethod(m)
    setValue('method', m)
    setSplitMode(false)
    setMomoPhone('')
    setMomoStatus('idle')
    setMomoError('')
    setSplitMomoAmount('')
    setSplitCashAmount('')
  }

  // Send Hubtel MoMo collect request and poll for approval
  const runMomoCollect = async (amountToCharge: number, phone: string, ref: string): Promise<boolean> => {
    setMomoStatus('sending')
    setMomoError('')
    try {
      const res = await fetch('/api/momo/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToCharge,
          phoneNumber: phone,
          channel: momoChannel,
          description: `Payment of GHS ${amountToCharge.toFixed(2)}`,
          clientReference: ref,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.transactionId) {
        setMomoStatus('failed')
        setMomoError(data.error || 'Failed to send MoMo request')
        return false
      }

      setMomoStatus('pending')

      // Poll for approval — every 5 s, up to 2 min
      return await new Promise<boolean>((resolve) => {
        let attempts = 0
        const interval = setInterval(async () => {
          attempts++
          try {
            // Keyed by our own reference: Hubtel's status endpoint no longer
            // accepts their transaction id.
            const sr = await fetch(`/api/momo/status?clientReference=${encodeURIComponent(ref)}`)
            const sd = await sr.json()
            if (sd.status === 'success') {
              clearInterval(interval)
              setMomoStatus('success')
              resolve(true)
            } else if (sd.status === 'failed' || sd.status === 'cancelled') {
              clearInterval(interval)
              setMomoStatus('failed')
              setMomoError('Customer declined or payment failed. Try again.')
              resolve(false)
            } else if (attempts >= 24) {
              clearInterval(interval)
              setMomoStatus('failed')
              setMomoError('MoMo request timed out. Ask the customer to try again.')
              resolve(false)
            }
          } catch {
            // network hiccup — keep polling
          }
        }, 5000)
      })
    } catch {
      setMomoStatus('failed')
      setMomoError('Network error sending MoMo request.')
      return false
    }
  }

  const handleFormSubmit = async (data: PaymentFormData) => {
    if (!selectedEntity) {
      setFormError(`Please select a ${label.toLowerCase()}`)
      return
    }
    setFormError('')
    setMomoError('')

    const ref = `PAY-${type.toUpperCase()}-${Date.now()}`

    // MoMo-only: send prompt first, wait for approval. Skipped entirely when
    // the business has no payment gateway — the money was collected on the
    // cashier's own phone and this is just recording it.
    if (method === 'MOMO' && !splitMode && momoCollectEnabled) {
      if (momoPhone.trim().length < 9) {
        setFormError('Enter the customer MoMo phone number first')
        return
      }
      const approved = await runMomoCollect(amount, momoPhone.trim(), ref)
      if (!approved) return
    }

    // Split (Cash + MoMo): send MoMo for the momo portion
    if (splitMode) {
      if (!splitReady) {
        setFormError('Cash and MoMo amounts must add up to the total')
        return
      }
      if (momoCollectEnabled) {
        if (momoPhone.trim().length < 9) {
          setFormError('Enter the MoMo phone number for the mobile portion')
          return
        }
        const approved = await runMomoCollect(splitMomoNum, momoPhone.trim(), `${ref}-MOMO`)
        if (!approved) return
      }
    }

    setIsSubmitting(true)
    try {
      const payload: PaymentFormData = {
        ...data,
        method: splitMode ? 'CASH' : method,
        momoPhone: (method === 'MOMO' || splitMode) ? momoPhone.trim() : undefined,
      }
      await onSubmit(payload)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  // With no payment gateway the number is a reference, not a destination, so
  // it must not block recording a payment the cashier already received.
  const momoPhoneValid = !momoCollectEnabled || momoPhone.trim().length >= 9
  const paymentReady = (() => {
    if (!selectedEntity || selectedEntity.balance === 0 || amount <= 0) return false
    if (method === 'MOMO' && !splitMode) return momoPhoneValid
    if (splitMode) return momoPhoneValid && splitReady
    return true
  })()

  const buttonLabel = (() => {
    if (momoStatus === 'sending') return 'Sending MoMo request...'
    if (momoStatus === 'pending') return 'Waiting for customer approval...'
    if (isSubmitting) return 'Recording...'
    return `Record Payment — ${formatCurrency(amount)}`
  })()

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">

      {/* Hidden field */}
      <input type="hidden" {...register(fieldName)} />

      {/* ── Entity Search ── */}
      <div className="relative">
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
              onClick={() => { setSelectedEntity(null); setValue(fieldName, ''); setSearch('') }}
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
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
              />
            </div>
            {showDropdown && filteredEntities.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border-2 border-gray-200 shadow-xl overflow-hidden">
                {filteredEntities.map(entity => (
                  <button
                    key={entity.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
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

      {selectedEntity && selectedEntity.balance === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm font-medium">
          ⚠ This {label.toLowerCase()} has no outstanding balance
        </div>
      )}

      {/* ── Payment Amount ── */}
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
          <p className="mt-1 text-xs text-gray-500">Maximum: {formatCurrency(selectedEntity.balance)}</p>
        )}
      </div>

      {/* Balance preview */}
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

      {/* ── Payment Method tabs ── */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-gray-700">
          Payment Method <span className="text-red-500">*</span>
        </label>

        {/* 4-tab row: Cash / MoMo / Bank / Split */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['CASH', 'MOMO', 'BANK'] as PaymentMethod[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => handleMethodChange(m)}
              className={`py-2.5 border-2 font-semibold text-xs transition-all ${
                method === m && !splitMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              <span className="block text-base leading-none mb-0.5">{m === 'CASH' ? '💵' : m === 'MOMO' ? '📱' : '🏦'}</span>
              {m === 'CASH' ? 'Cash' : m === 'MOMO' ? 'MoMo' : 'Bank'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setSplitMode(true); setMethod('CASH'); setValue('method', 'CASH'); setMomoStatus('idle'); setMomoError('') }}
            className={`py-2.5 border-2 font-semibold text-xs transition-all ${
              splitMode
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
            }`}
          >
            <span className="block text-base leading-none mb-0.5">✂</span>
            Split
          </button>
        </div>

        {/* MoMo phone — tap to open modal */}
        {(method === 'MOMO' || splitMode) && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              MoMo Phone Number{' '}
              {momoCollectEnabled
                ? <span className="text-red-500">*</span>
                : <span className="font-normal normal-case text-gray-400">(optional)</span>}
            </label>
            <button
              type="button"
              onClick={() => setMomoPhoneModalOpen(true)}
              className={`w-full px-3 py-2.5 border-2 text-sm text-left transition-colors ${
                momoPhone ? 'border-blue-400 text-gray-900 font-semibold' : 'border-blue-200 text-gray-400'
              } bg-white hover:border-blue-500`}
            >
              {momoPhone || 'Tap to enter MoMo number…'}
            </button>
            <p className="text-xs text-gray-400 mt-0.5">
              {/* Without a gateway no prompt is sent, so promising one would be a lie */}
              {momoStatus === 'idle' && !momoCollectEnabled &&
                'Recorded manually — no prompt is sent to the customer.'}
              {momoStatus === 'idle' && momoCollectEnabled && momoPhoneValid &&
                'Ready — click Record Payment to send prompt to customer.'}
              {momoStatus === 'idle' && momoCollectEnabled && !momoPhoneValid &&
                'Tap above to enter the number.'}
              {momoStatus === 'sending' && '⏳ Sending MoMo request to customer...'}
              {momoStatus === 'pending' && '⏳ Waiting for customer to approve on their phone...'}
              {momoStatus === 'success' && '✓ Customer approved the payment.'}
            </p>
            {momoError && (
              <p className="text-xs text-red-600 mt-0.5">✗ {momoError}</p>
            )}
          </div>
        )}

        {/* Split breakdown */}
        {splitMode && amount > 0 && (
          <div className="border border-purple-200 bg-purple-50 p-3 space-y-2">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Split breakdown — total: {formatCurrency(amount)}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">📱 MoMo amount</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  max={amount}
                  value={splitMomoAmount}
                  onChange={e => setSplitMomoAmount(e.target.value)}
                  className="w-full px-2 py-2 border border-purple-300 focus:border-purple-500 focus:outline-none text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">💵 Cash amount</label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={splitCashAmount}
                  onChange={e => setSplitCashAmount(e.target.value)}
                  className="w-full px-2 py-2 border border-purple-300 focus:border-purple-500 focus:outline-none text-sm font-semibold"
                />
              </div>
            </div>
            {splitMomoNum + splitCashNum > 0 && (
              <p className={`text-xs font-semibold ${splitReady ? 'text-green-700' : 'text-red-600'}`}>
                {splitReady
                  ? `✓ ${formatCurrency(splitMomoNum)} MoMo + ${formatCurrency(splitCashNum)} Cash = ${formatCurrency(amount)}`
                  : `Total mismatch: ${formatCurrency(splitMomoNum + splitCashNum)} ≠ ${formatCurrency(amount)}`}
              </p>
            )}
          </div>
        )}

        {/* Bank fields */}
        {method === 'BANK' && !splitMode && (
          <div className="space-y-2 border border-blue-100 bg-blue-50/50 p-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Bank Name</label>
              <input type="text" placeholder="e.g. GCB Bank, Ecobank" {...register('bankName')} className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Account Holder Name</label>
              <input type="text" placeholder="Name on the bank account" {...register('bankAccountName')} className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Transaction / Reference No.</label>
              <input type="text" placeholder="Bank transaction or reference number" {...register('bankReference')} className="w-full px-3 py-2 border border-gray-300 focus:border-blue-500 focus:outline-none text-sm bg-white" />
            </div>
          </div>
        )}
      </div>

      {/* Errors */}
      {formError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
          ⚠ {formError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || momoStatus === 'sending' || momoStatus === 'pending' || !paymentReady}
          className="flex-1 py-4 bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
        >
          {buttonLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting || momoStatus === 'sending' || momoStatus === 'pending'}
            className="w-28 py-4 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <MomoPhoneModal
        open={momoPhoneModalOpen}
        // No gateway means no prompt is sent, so there is nothing to verify.
        skipVerification={!momoCollectEnabled}
        initialValue={momoPhone}
        onAccept={(phone, channel) => {
          setMomoPhone(phone)
          setMomoChannel(channel)
          setMomoStatus('idle')
          setMomoError('')
        }}
        onClose={() => setMomoPhoneModalOpen(false)}
      />
    </form>
  )
}
