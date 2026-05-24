'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'

interface Customer {
  id: string
  name: string
  phone: string | null
  balance: number
}

interface RowState {
  newBalance: string   // string for controlled input
  dirty: boolean
  saving: boolean
  error: string
  saved: boolean
}

export default function AdjustBalancePage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isSavingAll, setIsSavingAll] = useState(false)

  useEffect(() => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => {
        const list: Customer[] = data.customers || data.data || data || []
        setCustomers(list)
        const initial: Record<string, RowState> = {}
        list.forEach(c => {
          initial[c.id] = { newBalance: '', dirty: false, saving: false, error: '', saved: false }
        })
        setRows(initial)
      })
      .finally(() => setLoading(false))
  }, [])

  const setRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const saveRow = async (customer: Customer) => {
    const row = rows[customer.id]
    if (!row.dirty || row.newBalance === '') return
    const bal = parseFloat(row.newBalance)
    if (isNaN(bal) || bal < 0) {
      setRow(customer.id, { error: 'Balance must be 0 or more' })
      return
    }
    setRow(customer.id, { saving: true, error: '' })
    try {
      const res = await fetch('/api/customers/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, balance: bal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, balance: bal } : c))
      setRow(customer.id, { saving: false, dirty: false, newBalance: '', saved: true, error: '' })
      setTimeout(() => setRow(customer.id, { saved: false }), 2000)
    } catch (err) {
      setRow(customer.id, { saving: false, error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const saveAll = async () => {
    const dirtyCustomers = customers.filter(c => rows[c.id]?.dirty && rows[c.id]?.newBalance !== '')
    if (dirtyCustomers.length === 0) return
    setIsSavingAll(true)
    for (const customer of dirtyCustomers) {
      await saveRow(customer)
    }
    setIsSavingAll(false)
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
  })

  const dirtyCount = Object.values(rows).filter(r => r.dirty && r.newBalance !== '').length

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => router.push('/customers')} className="p-2 hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Adjust Customer Balances</h1>
              <p className="text-sm text-gray-500">Enter a new balance for any customer, then save</p>
            </div>
          </div>
          {dirtyCount > 0 && (
            <button
              onClick={saveAll}
              disabled={isSavingAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60 text-sm shadow-md"
            >
              {isSavingAll ? 'Saving…' : `Save All (${dirtyCount})`}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-indigo-500 focus:outline-none text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Phone</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Current Balance</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase w-44">New Balance (GH₵)</th>
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(customer => {
                    const row = rows[customer.id]
                    if (!row) return null
                    const newBal = row.newBalance !== '' ? parseFloat(row.newBalance) : null
                    return (
                      <tr key={customer.id} className={`transition-colors ${row.saved ? 'bg-green-50' : row.dirty ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-gray-900">{customer.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{customer.phone || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${customer.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {customer.balance > 0 ? formatCurrency(customer.balance) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.newBalance}
                            onChange={e => setRow(customer.id, { newBalance: e.target.value, dirty: e.target.value !== '', saved: false, error: '' })}
                            placeholder={customer.balance.toFixed(2)}
                            className="w-full px-2 py-1.5 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.error && <p className="text-xs text-red-600 mb-1">{row.error}</p>}
                          {row.saved ? (
                            <span className="text-xs text-green-600 font-semibold">✓ Saved</span>
                          ) : (
                            <button
                              onClick={() => saveRow(customer)}
                              disabled={!row.dirty || row.newBalance === '' || row.saving}
                              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {row.saving ? '…' : 'Save'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map(customer => {
                const row = rows[customer.id]
                if (!row) return null
                return (
                  <div key={customer.id} className={`p-4 space-y-3 ${row.saved ? 'bg-green-50' : row.dirty ? 'bg-indigo-50/40' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-500">{customer.phone || 'No phone'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Balance</p>
                        <span className={`font-bold ${customer.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {customer.balance > 0 ? formatCurrency(customer.balance) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" min="0" step="0.01"
                        value={row.newBalance}
                        onChange={e => setRow(customer.id, { newBalance: e.target.value, dirty: e.target.value !== '', saved: false, error: '' })}
                        placeholder={`New balance (${customer.balance.toFixed(2)})`}
                        className="flex-1 px-3 py-2 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      {row.saved ? (
                        <span className="text-xs text-green-600 font-semibold px-2">✓</span>
                      ) : (
                        <button onClick={() => saveRow(customer)}
                          disabled={!row.dirty || row.newBalance === '' || row.saving}
                          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-30">
                          {row.saving ? '…' : 'Save'}
                        </button>
                      )}
                    </div>
                    {row.error && <p className="text-xs text-red-600">{row.error}</p>}
                  </div>
                )
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="font-semibold">No customers found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
