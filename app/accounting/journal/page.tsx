'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'

interface JournalEntry {
  id: string
  entryNumber: string
  date: string
  description: string
  source: string
  status: string
  lines: Array<{
    debit: number
    credit: number
    account: { code: string; name: string }
    description?: string
  }>
}

const SOURCE_COLORS: Record<string, string> = {
  SALE:             'bg-green-100 text-green-800',
  PURCHASE:         'bg-blue-100 text-blue-800',
  CUSTOMER_PAYMENT: 'bg-teal-100 text-teal-800',
  SUPPLIER_PAYMENT: 'bg-cyan-100 text-cyan-800',
  EXPENSE:          'bg-yellow-100 text-yellow-800',
  CUSTOMER_RETURN:  'bg-orange-100 text-orange-800',
  SUPPLIER_RETURN:  'bg-red-100 text-red-800',
  STOCK_ADJUSTMENT: 'bg-purple-100 text-purple-800',
  TRANSFER:         'bg-sky-100 text-sky-800',
  PAYROLL:          'bg-amber-100 text-amber-800',
  MANUAL:           'bg-gray-100 text-gray-800',
}

const SOURCES = ['SALE','PURCHASE','CUSTOMER_PAYMENT','SUPPLIER_PAYMENT','EXPENSE','CUSTOMER_RETURN','SUPPLIER_RETURN','STOCK_ADJUSTMENT','TRANSFER','PAYROLL','MANUAL']

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [sourceFilter, setSourceFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchEntries = useCallback((p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '25' })
    if (sourceFilter) params.set('source', sourceFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    fetch(`/api/accounting/journal?${params}`)
      .then(r => r.json())
      .then(d => {
        setEntries(d.entries ?? [])
        setTotal(d.pagination?.total ?? 0)
        setTotalPages(d.pagination?.pages ?? 1)
      })
      .catch(() => setError('Failed to load journal entries'))
      .finally(() => setLoading(false))
  }, [endDate, sourceFilter, startDate])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchEntries(page)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [fetchEntries, page])

  const entryTotal = (entry: JournalEntry) =>
    entry.lines.reduce((s, l) => s + l.debit, 0)

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-3">
              <BookOpen className="w-7 h-7 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Journal Ledger</h1>
              <p className="text-sm text-gray-600">{total} entries</p>
            </div>
          </div>
          <Link
            href="/accounting/journal/new"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow transition-all"
          >
            <Plus className="w-4 h-4" />
            Manual Entry
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white border-2 border-gray-200 p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Source</label>
              <select
                className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={sourceFilter}
                onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
              >
                <option value="">All Sources</option>
                {SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
              <input
                type="date"
                className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(1) }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
              <input
                type="date"
                className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(1) }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Entries table */}
        <div className="bg-white border-2 border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading entries…</div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No journal entries found</div>
          ) : (
            <>
              <div className="grid grid-cols-12 px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                <span className="col-span-1">Entry #</span>
                <span className="col-span-2">Date</span>
                <span className="col-span-2">Source</span>
                <span className="col-span-4">Description</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-1 text-right">Status</span>
              </div>
              <div className="divide-y divide-gray-100">
                {entries.map(entry => (
                  <Link
                    key={entry.id}
                    href={`/accounting/journal/${entry.id}`}
                    className="grid grid-cols-12 px-5 py-3 text-sm items-center hover:bg-gray-50 transition-colors"
                  >
                    <span className="col-span-1 font-mono font-bold text-indigo-700">{entry.entryNumber}</span>
                    <span className="col-span-2 text-gray-600">{new Date(entry.date).toLocaleDateString()}</span>
                    <span className="col-span-2">
                      <span className={`text-xs font-semibold px-2 py-0.5  ${SOURCE_COLORS[entry.source] ?? 'bg-gray-100 text-gray-700'}`}>
                        {entry.source.replace(/_/g, ' ')}
                      </span>
                    </span>
                    <span className="col-span-4 text-gray-800 truncate pr-2">{entry.description}</span>
                    <span className="col-span-2 text-right font-semibold text-gray-900">
                      {entryTotal(entry).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="col-span-1 text-right">
                      {entry.status === 'REVERSED' && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 ">Rev</span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{total} results</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} pageSize={25} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
