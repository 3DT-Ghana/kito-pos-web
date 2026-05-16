'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Briefcase, Plus, X, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

type RunStatus = 'DRAFT' | 'APPROVED' | 'PAID'

interface PayrollRun {
  id: string
  periodYear: number
  periodMonth: number
  status: RunStatus
  totalGross: number
  totalSSFEmployee: number
  totalSSFEmployer: number
  totalPAYE: number
  totalOtherDeductions: number
  totalNetPay: number
  createdAt: string
  createdBy: { name: string } | null
  approvedBy: { name: string } | null
  _count: { lines: number }
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const STATUS_STYLES: Record<RunStatus, string> = {
  DRAFT:    'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID:     'bg-green-100 text-green-700',
}

const now = new Date()

export default function PayrollRunsPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [periodYear, setPeriodYear] = useState(now.getFullYear())
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payroll/runs?limit=50')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setRuns(data.runs)
      setTotal(data.total)
    } catch {
      setError('Failed to load payroll runs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodYear, periodMonth }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create run'); return }
      setShowCreate(false)
      router.push(`/payroll/runs/${data.run.id}`)
    } catch {
      setCreateError('Failed to create payroll run')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <Briefcase className="w-8 h-8 text-green-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payroll Runs</h1>
              <p className="text-gray-600 mt-1">Create and manage monthly payroll runs</p>
            </div>
          </div>
          <button
            onClick={() => { setCreateError(''); setShowCreate(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow transition active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Run
          </button>
        </div>

        {/* How it works note */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">How payroll runs work</p>
          <p className="text-xs text-blue-700">
            1. Create a run for a month — it auto-computes PAYE and SSF for all active employees (DRAFT).
            2. Review the breakdown and approve it (APPROVED).
            3. Disburse payroll from cash, bank, or MoMo — this posts the payroll journal entry and statutory liabilities to your accounting ledger.
          </p>
        </div>

        {/* Runs list */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading payroll runs…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-600">{error}</div>
          ) : runs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-semibold">No payroll runs yet</p>
              <p className="text-sm mt-1">Create your first run to begin processing payroll</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Period</th>
                    <th className="text-center px-4 py-3 font-bold text-gray-700">Status</th>
                    <th className="text-center px-4 py-3 font-bold text-gray-700">Employees</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-700">Gross Pay</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-700">Total PAYE</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-700">Net Pay</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Created By</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr
                      key={run.id}
                      onClick={() => router.push(`/payroll/runs/${run.id}`)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES[run.status]}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{run._count.lines}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(run.totalGross)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(run.totalPAYE)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{formatCurrency(run.totalNetPay)}</td>
                      <td className="px-4 py-3 text-gray-500">{run.createdBy?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-400 text-center">{total} run{total !== 1 ? 's' : ''} total</p>
      </div>

      {/* Create Run Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">New Payroll Run</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Month</label>
                <select
                  value={periodMonth}
                  onChange={e => setPeriodMonth(parseInt(e.target.value))}
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Year</label>
                <input
                  type="number"
                  value={periodYear}
                  onChange={e => setPeriodYear(parseInt(e.target.value))}
                  min="2000"
                  max="2100"
                  className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                />
              </div>
              <p className="text-xs text-gray-500">
                This will compute PAYE and SSF deductions for all active employees and create a DRAFT run.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
