'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'

const CATEGORIES = [
  { value: 'RENT', label: 'Rent', icon: '🏠' },
  { value: 'SALARIES', label: 'Salaries', icon: '👷' },
  { value: 'UTILITIES', label: 'Utilities', icon: '💡' },
  { value: 'TRANSPORT', label: 'Transport', icon: '🚗' },
  { value: 'MARKETING', label: 'Marketing', icon: '📣' },
  { value: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
  { value: 'OTHER', label: 'Other', icon: '📋' },
]

export default function NewExpensePage() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOMO' | 'BANK'>('CASH')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!category) { setError('Please select a category'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount'); return }
    if (!description.trim()) { setError('Please enter a description'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // paymentMethod was never sent, so every expense created here was
        // hardcoded to CASH in the GL and deducted from the till drawer.
        body: JSON.stringify({ amount: parseFloat(amount), category, description, paidBy, paymentMethod }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save expense')
      router.push('/expenses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/expenses')} className="p-2 hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Add Expense</h1>
            <p className="text-sm text-gray-500">Record a business cost</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-5 space-y-5">

          {/* Category selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Category *</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 border-2 text-sm font-semibold transition-all ${
                    category === cat.value
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">GHS</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                placeholder="0.00"
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Monthly shop rent, Driver salary for January..."
              className="w-full px-4 py-3 border-2 border-gray-200 text-sm focus:border-red-500 focus:outline-none resize-none"
            />
          </div>

          {/* Payment method — determines which account is credited and whether
              the till deducts this from the cash drawer */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Paid With</label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'MOMO', 'BANK'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-3 border-2 font-semibold text-sm transition-colors ${
                    paymentMethod === m
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                  }`}
                >
                  {m === 'CASH' ? '💵 Cash' : m === 'MOMO' ? '📱 MoMo' : '🏦 Bank'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Only cash-paid expenses are deducted from the till drawer.
            </p>
          </div>

          {/* Paid By */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Paid By <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={paidBy}
              onChange={e => setPaidBy(e.target.value)}
              placeholder="e.g. John, Petty cash, Bank"
              className="w-full px-4 py-3 border-2 border-gray-200 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Save Expense'}
          </button>

        </form>
      </div>
    </AppLayout>
  )
}
