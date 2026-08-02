'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, ArrowLeft, RotateCcw } from 'lucide-react'

interface JournalLine {
  id: string
  debit: number
  credit: number
  description?: string
  account: { id: string; code: string; name: string; type: string }
}

interface JournalEntry {
  id: string
  entryNumber: string
  date: string
  description: string
  source: string
  status: string
  lines: JournalLine[]
}

export default function JournalEntryPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [reversing, setReversing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // res.ok was never checked, so an error body ({ error: ... }) was set as
    // the entry — then `entry.lines.map` threw and the permission-denied path
    // rendered as a client-side crash rather than a message.
    const load = async () => {
      try {
        const res = await fetch(`/api/accounting/journal/${id}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load journal entry')
        setEntry(data)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to load journal entry')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  const handleReverse = async () => {
    if (!confirm('Create a reversal entry for this journal entry?')) return
    setReversing(true)
    try {
      const res = await fetch(`/api/accounting/journal/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Failed to reverse entry')
        return
      }
      router.push(`/accounting/journal/${data.id}`)
    } catch {
      setMessage('Failed to reverse entry')
    } finally {
      setReversing(false)
    }
  }

  const totalDebit  = entry?.lines.reduce((s, l) => s + l.debit,  0) ?? 0
  const totalCredit = entry?.lines.reduce((s, l) => s + l.credit, 0) ?? 0

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>
      </AppLayout>
    )
  }

  if (!entry) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center gap-4 h-64 justify-center text-gray-500">
          <p>Journal entry not found.</p>
          <Link href="/accounting/journal" className="text-indigo-600 hover:underline text-sm">← Back to Journal</Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/accounting/journal"
              className="p-2 border-2 border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div className="bg-indigo-100 p-2">
              <BookOpen className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{entry.entryNumber}</h1>
              <p className="text-sm text-gray-500">{new Date(entry.date).toLocaleDateString('en-GH', { dateStyle: 'long' })}</p>
            </div>
          </div>
          {entry.status === 'POSTED' && (
            <button
              onClick={handleReverse}
              disabled={reversing}
              className="flex items-center gap-2 px-4 py-2 border-2 border-red-300 text-red-700 hover:bg-red-50 font-semibold transition-all disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              {reversing ? 'Reversing…' : 'Reverse Entry'}
            </button>
          )}
        </div>

        {message && (
          <div className="bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{message}</div>
        )}

        {/* Entry details */}
        <div className="bg-white border-2 border-gray-200 p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Source</p>
              <p className="font-semibold text-gray-900 mt-0.5">{entry.source.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Status</p>
              <p className={`font-semibold mt-0.5 ${entry.status === 'REVERSED' ? 'text-red-600' : 'text-green-700'}`}>
                {entry.status}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Entry Number</p>
              <p className="font-mono font-bold text-indigo-700 mt-0.5">{entry.entryNumber}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Description</p>
            <p className="text-gray-800 mt-0.5">{entry.description}</p>
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white border-2 border-gray-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
            <span className="col-span-1">Code</span>
            <span className="col-span-4">Account</span>
            <span className="col-span-3">Description</span>
            <span className="col-span-2 text-right">Debit</span>
            <span className="col-span-2 text-right">Credit</span>
          </div>
          <div className="divide-y divide-gray-100">
            {entry.lines.map(line => (
              <div key={line.id} className="grid grid-cols-12 px-5 py-3 text-sm items-center">
                <span className="col-span-1 font-mono text-xs text-gray-500">{line.account.code}</span>
                <span className="col-span-4 font-medium text-gray-900">{line.account.name}</span>
                <span className="col-span-3 text-xs text-gray-500">{line.description ?? '—'}</span>
                <span className="col-span-2 text-right font-semibold text-gray-900">
                  {line.debit > 0 ? line.debit.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}
                </span>
                <span className="col-span-2 text-right font-semibold text-gray-900">
                  {line.credit > 0 ? line.credit.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}
                </span>
              </div>
            ))}
          </div>
          {/* Totals */}
          <div className="grid grid-cols-12 px-5 py-3 text-sm font-bold bg-gray-50 border-t-2 border-gray-200">
            <span className="col-span-8 text-right text-gray-700">Total</span>
            <span className="col-span-2 text-right text-gray-900">{totalDebit.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
            <span className="col-span-2 text-right text-gray-900">{totalCredit.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {Math.abs(totalDebit - totalCredit) > 0.01 && (
          <div className="bg-red-50 border border-red-200 p-3 text-red-700 text-sm font-semibold">
            Warning: Entry is not balanced (debits {totalDebit.toFixed(2)} ≠ credits {totalCredit.toFixed(2)})
          </div>
        )}
      </div>
    </AppLayout>
  )
}
