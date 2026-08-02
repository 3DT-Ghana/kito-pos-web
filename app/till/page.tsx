'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'

interface Shift {
  id: string
  status: 'OPEN' | 'CLOSED'
  openingFloat: number
  closingCount: number | null
  expectedCash: number | null
  variance: number | null
  note: string | null
  openedAt: string
  closedAt: string | null
}

interface RunningTotals {
  openingFloat: number
  cashSales: number
  cashPaymentsReceived: number
  cashExpenses: number
  cashRefunds: number
  cashSupplierPayments: number
  cashIn: number
  cashOut: number
  expectedCash: number
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function TillPage() {
  const { currentBranchId } = useBranch()
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])
  const [runningTotals, setRunningTotals] = useState<RunningTotals | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Open shift form
  const [openingFloat, setOpeningFloat] = useState('')
  const [isOpening, setIsOpening] = useState(false)

  // Close shift form
  const [closingCount, setClosingCount] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)

  useEffect(() => {
    fetchTill()
  }, [currentBranchId])

  // Refresh running totals every 60 seconds while a shift is open.
  // Separate effect with openShift in deps so the interval always sees the current value.
  useEffect(() => {
    if (!openShift) return
    // Background refresh — must not toggle isLoading, which replaces the whole
    // page and threw away a half-typed cash count every 60 seconds.
    const interval = setInterval(() => fetchTill({ background: true }), 60000)
    return () => clearInterval(interval)
  }, [openShift?.id])

  const fetchTill = async ({ background = false }: { background?: boolean } = {}) => {
    try {
      if (!background) setIsLoading(true)
      const res = await fetch('/api/till')
      if (!res.ok) {
        // The body carries the specific reason — "select a branch", a
        // permission denial, the feature flag — all previously flattened into
        // one generic string.
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load till data')
      }
      const data = await res.json()
      setOpenShift(data.openShift)
      setTodayShifts(data.todayShifts || [])
      setRunningTotals(data.runningTotals)
      setError('')
    } catch (err) {
      // A failed background poll must not blank a working screen
      if (!background) {
        setError(err instanceof Error ? err.message : 'Failed to load till')
      }
    } finally {
      if (!background) setIsLoading(false)
    }
  }

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsOpening(true)
    try {
      const res = await fetch('/api/till', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingFloat: parseFloat(openingFloat) || 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open shift')
      setOpeningFloat('')
      // Background so a refetch hiccup cannot paint a load error over a shift
      // that opened successfully.
      await fetchTill({ background: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open shift')
    } finally {
      setIsOpening(false)
    }
  }

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!closingCount) { setError('Enter the cash count'); return }
    setIsClosing(true)
    try {
      const res = await fetch('/api/till', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCount: parseFloat(closingCount), note: closeNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to close shift')
      setClosingCount('')
      setCloseNote('')
      setShowCloseForm(false)
      await fetchTill({ background: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close shift')
    } finally {
      setIsClosing(false)
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">Loading till...</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Till / Cash Register</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your cash shift</p>
          </div>
          <div className={`px-3 py-1.5 -full text-xs font-bold ${openShift ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {openShift ? '● SHIFT OPEN' : '○ NO OPEN SHIFT'}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        {/* No open shift — open one */}
        {!openShift && (
          <div className="bg-white border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Open New Shift</h2>
            <p className="text-sm text-gray-500 mb-4">Count the cash in the till and enter the opening float before starting.</p>
            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Opening Float (GHS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">GHS</span>
                  <input
                    type="number"
                    value={openingFloat}
                    onChange={e => setOpeningFloat(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Enter 0 if the till is empty at the start.</p>
              </div>
              <button
                type="submit"
                disabled={isOpening}
                className="w-full py-3 bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {isOpening ? 'Opening…' : 'Open Shift'}
              </button>
            </form>
          </div>
        )}

        {/* Open shift — running totals */}
        {openShift && runningTotals && (
          <>
            <div className="bg-white border border-gray-200 overflow-hidden">
              <div className="bg-green-600 px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-semibold">Shift opened at</p>
                  <p className="text-white font-bold text-lg">{formatTime(openShift.openedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-100 text-xs font-semibold">Opening Float</p>
                  <p className="text-white font-bold text-lg">{formatCurrency(runningTotals.openingFloat)}</p>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {/* Cash in */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Cash In</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cash Sales</span>
                      <span className="font-semibold text-green-600">+{formatCurrency(runningTotals.cashSales)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Customer Payments (Cash)</span>
                      <span className="font-semibold text-green-600">+{formatCurrency(runningTotals.cashPaymentsReceived)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Cash out — refunds and supplier payments also leave the
                    drawer and were previously not shown or counted at all */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Cash Out</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Expenses (Cash)</span>
                      <span className="font-semibold text-red-600">−{formatCurrency(runningTotals.cashExpenses)}</span>
                    </div>
                    {runningTotals.cashRefunds > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Customer Refunds (Cash)</span>
                        <span className="font-semibold text-red-600">−{formatCurrency(runningTotals.cashRefunds)}</span>
                      </div>
                    )}
                    {runningTotals.cashSupplierPayments > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Supplier Payments (Cash)</span>
                        <span className="font-semibold text-red-600">−{formatCurrency(runningTotals.cashSupplierPayments)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* Expected total */}
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900">Expected in Till</span>
                  <span className="text-xl font-bold text-gray-900">{formatCurrency(runningTotals.expectedCash)}</span>
                </div>
              </div>
            </div>

            {/* Close shift */}
            {!showCloseForm ? (
              <button
                onClick={() => setShowCloseForm(true)}
                className="w-full py-3 border-2 border-red-400 text-red-600 font-bold text-sm hover:bg-red-50"
              >
                Close Shift
              </button>
            ) : (
              <div className="bg-white border border-gray-200 p-5">
                <h2 className="text-base font-bold text-gray-900 mb-1">Close Shift</h2>
                <p className="text-sm text-gray-500 mb-4">Count the physical cash in the till and enter the total below.</p>
                <form onSubmit={handleCloseShift} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Actual Cash Count (GHS)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">GHS</span>
                      <input
                        type="number"
                        value={closingCount}
                        onChange={e => setClosingCount(e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        autoFocus
                        className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 text-sm focus:border-red-400 focus:outline-none"
                      />
                    </div>
                    {closingCount && runningTotals && (
                      <div className={`mt-2 px-3 py-2 text-sm font-semibold ${
                        parseFloat(closingCount) - runningTotals.expectedCash >= 0
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}>
                        Variance: {parseFloat(closingCount) - runningTotals.expectedCash >= 0 ? '+' : ''}
                        {formatCurrency(parseFloat(closingCount) - runningTotals.expectedCash)}
                        {Math.abs(parseFloat(closingCount) - runningTotals.expectedCash) < 0.01 ? ' ✓ Balanced' : ''}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Note <span className="font-normal text-gray-400">(optional)</span></label>
                    <input
                      type="text"
                      value={closeNote}
                      onChange={e => setCloseNote(e.target.value)}
                      placeholder="e.g. Short due to refund given in cash"
                      className="w-full px-4 py-3 border-2 border-gray-200 text-sm focus:border-red-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCloseForm(false)}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isClosing}
                      className="flex-1 py-3 bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      {isClosing ? 'Closing…' : 'Close Shift'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        {/* Today's shift history */}
        {todayShifts.filter(s => s.status === 'CLOSED').length > 0 && (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Today&apos;s Shifts</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {todayShifts.filter(s => s.status === 'CLOSED').map(shift => {
                const balanced = Math.abs(shift.variance || 0) < 0.01
                const surplus = (shift.variance || 0) > 0
                return (
                  <div key={shift.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">
                        {formatTime(shift.openedAt)} → {shift.closedAt ? formatTime(shift.closedAt) : '—'}
                      </p>
                      <span className={`text-xs font-bold px-2 py-0.5 -full ${
                        balanced ? 'bg-green-100 text-green-700' : surplus ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {balanced ? 'Balanced' : surplus ? `+${formatCurrency(shift.variance || 0)}` : formatCurrency(shift.variance || 0)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-gray-400">Float</p>
                        <p className="font-semibold text-gray-700">{formatCurrency(shift.openingFloat)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Expected</p>
                        <p className="font-semibold text-gray-700">{formatCurrency(shift.expectedCash || 0)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Counted</p>
                        <p className="font-semibold text-gray-700">{formatCurrency(shift.closingCount || 0)}</p>
                      </div>
                    </div>
                    {shift.note && (
                      <p className="text-xs text-gray-400 mt-1.5 italic">&quot;{shift.note}&quot;</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  )
}
