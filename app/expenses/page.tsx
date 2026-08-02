'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Receipt, Trash2, Plus, TrendingDown } from 'lucide-react'

interface Expense {
  id: string
  amount: number
  category: string
  description: string
  paidBy: string | null
  createdAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Rent',
  SALARIES: 'Salaries',
  UTILITIES: 'Utilities',
  TRANSPORT: 'Transport',
  MARKETING: 'Marketing',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Other',
}

const CATEGORY_BADGE: Record<string, 'blue' | 'violet' | 'amber' | 'orange' | 'red' | 'green' | 'gray'> = {
  RENT: 'blue',
  SALARIES: 'violet',
  UTILITIES: 'amber',
  TRANSPORT: 'orange',
  MARKETING: 'red',
  MAINTENANCE: 'red',
  OTHER: 'gray',
}

export default function ExpensesPage() {
  const router = useRouter()
  const { currentBranchId } = useBranch()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [byCategory, setByCategory] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const [category, setCategory] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => { fetchExpenses() }, [category, startDate, endDate, currentBranchId])
  useEffect(() => setPage(1), [category, startDate, endDate])

  const fetchExpenses = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/expenses?${params}`)
      if (!res.ok) throw new Error('Failed to load expenses')
      const data = await res.json()
      setExpenses(data.expenses || [])
      setTotalAmount(data.totalAmount || 0)
      setByCategory(data.byCategory || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete expense')
      fetchExpenses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Expenses"
          subtitle="Track non-inventory business costs"
          actions={<Btn icon={Plus} href="/expenses/new">Add Expense</Btn>}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white shadow-sm ring-1 ring-black/5 p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Expenses"
            value={formatCurrency(totalAmount)}
            sub={`${expenses.length} records`}
            icon={TrendingDown}
            accent="bg-red-50"
            iconColor="text-red-500"
            valueColor="text-red-600"
          />
          <StatCard
            label="Top Category"
            value={topCategory ? CATEGORY_LABELS[topCategory[0]] || topCategory[0] : '—'}
            sub={topCategory ? formatCurrency(topCategory[1]) : undefined}
            icon={Receipt}
            accent="bg-violet-50"
            iconColor="text-violet-600"
          />
        </div>

        {Object.keys(byCategory).length > 0 && (
          <div className="bg-white shadow-sm ring-1 ring-black/5 p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Breakdown by Category</p>
            <div className="space-y-3">
              {Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amt]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <Badge variant={CATEGORY_BADGE[cat] ?? 'gray'} className="shrink-0 w-24 justify-center">
                      {CATEGORY_LABELS[cat] || cat}
                    </Badge>
                    <div className="flex-1 bg-gray-100 -full h-1.5 overflow-hidden">
                      <div
                        className="bg-red-400 h-1.5 -full transition-all"
                        style={{ width: `${Math.round((amt / totalAmount) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-24 text-right shrink-0">
                      {formatCurrency(amt)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Expense Records</h2>
            <span className="text-xs text-gray-400">{expenses.length} records</span>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={Receipt}
                title="No expenses recorded"
                description="Add your first expense to start tracking costs"
              />
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(exp => (
                <div key={exp.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                  <Badge variant={CATEGORY_BADGE[exp.category] ?? 'gray'} className="shrink-0">
                    {CATEGORY_LABELS[exp.category] || exp.category}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{exp.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(new Date(exp.createdAt))}
                      {exp.paidBy && <> · Paid by {exp.paidBy}</>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-600 shrink-0">{formatCurrency(exp.amount)}</span>
                  <button
                    onClick={() => handleDelete(exp.id)}
                    disabled={deletingId === exp.id}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                    title="Delete expense"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {expenses.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">{expenses.length} results</span>
              <Pagination page={page} totalPages={Math.ceil(expenses.length / PAGE_SIZE)} onPageChange={setPage} totalItems={expenses.length} pageSize={PAGE_SIZE} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
