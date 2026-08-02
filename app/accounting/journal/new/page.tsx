'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { round2 } from '@/lib/accounting/accounts'

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface Line {
  accountId: string
  debit: string
  credit: string
  description: string
}

export default function NewJournalPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([
    { accountId: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Was `.catch(() => {})` with a no-op `.filter(() => true)` — a failed load
    // left an empty account dropdown with no way to tell whether the tenant had
    // no accounts or the request had failed.
    const load = async () => {
      try {
        const res = await fetch('/api/accounting/accounts?activeOnly=true')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load accounts')
        setAccounts(data.accounts ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts')
      }
    }
    void load()
  }, [])

  const updateLine = (idx: number, field: keyof Line, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addLine = () =>
    setLines(prev => [...prev, { accountId: '', debit: '', credit: '', description: '' }])

  const removeLine = (idx: number) =>
    setLines(prev => prev.filter((_, i) => i !== idx))

  const totalDebit  = round2(lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0))
  const totalCredit = round2(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0))
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

  const handleSubmit = async () => {
    setError('')
    if (!description.trim()) { setError('Description is required'); return }
    if (!balanced) { setError('Journal entry must be balanced (total debits = total credits)'); return }

    const validLines = lines.filter(l => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length < 2) { setError('At least two lines with amounts are required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          date,
          lines: validLines.map(l => ({
            accountId:   l.accountId,
            debit:       parseFloat(l.debit)  || 0,
            credit:      parseFloat(l.credit) || 0,
            description: l.description.trim() || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to post entry'); return }
      router.push(`/accounting/journal/${data.id}`)
    } catch {
      setError('Failed to post entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/accounting/journal"
            className="p-2 border-2 border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Manual Journal Entry</h1>
            <p className="text-sm text-gray-500">Post a custom double-entry journal entry</p>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white border-2 border-gray-200 p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label>
              <input
                className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. Correction to rent expense"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input
                type="date"
                className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white border-2 border-gray-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
            <span className="col-span-4">Account</span>
            <span className="col-span-3">Description</span>
            <span className="col-span-2 text-right">Debit</span>
            <span className="col-span-2 text-right">Credit</span>
            <span className="col-span-1" />
          </div>
          <div className="divide-y divide-gray-100">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 px-5 py-3 gap-2 items-center">
                <div className="col-span-4">
                  <select
                    className="w-full border-2 border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                    value={line.accountId}
                    onChange={e => updateLine(idx, 'accountId', e.target.value)}
                  >
                    <option value="">— Select Account —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <input
                    className="w-full border-2 border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                    placeholder="Optional"
                    value={line.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border-2 border-gray-200 px-2 py-1.5 text-xs text-right focus:border-indigo-500 focus:outline-none"
                    placeholder="0.00"
                    value={line.debit}
                    onChange={e => updateLine(idx, 'debit', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border-2 border-gray-200 px-2 py-1.5 text-xs text-right focus:border-indigo-500 focus:outline-none"
                    placeholder="0.00"
                    value={line.credit}
                    onChange={e => updateLine(idx, 'credit', e.target.value)}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  {lines.length > 2 && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-12 px-5 py-3 border-t-2 border-gray-200 bg-gray-50">
            <span className="col-span-7 text-sm font-bold text-gray-700 text-right">Totals</span>
            <span className={`col-span-2 text-right text-sm font-bold ${balanced ? 'text-gray-900' : 'text-red-600'}`}>
              {totalDebit.toFixed(2)}
            </span>
            <span className={`col-span-2 text-right text-sm font-bold ${balanced ? 'text-gray-900' : 'text-red-600'}`}>
              {totalCredit.toFixed(2)}
            </span>
            <span className="col-span-1 text-right text-xs text-green-600 font-semibold">
              {balanced && totalDebit > 0 ? '✓' : ''}
            </span>
          </div>
        </div>

        <button
          onClick={addLine}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add Line
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={saving || !balanced || totalDebit === 0}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Posting…' : 'Post Journal Entry'}
          </button>
          <Link
            href="/accounting/journal"
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-all"
          >
            Cancel
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}
