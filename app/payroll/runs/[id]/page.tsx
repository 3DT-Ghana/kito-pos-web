'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { Briefcase, ArrowLeft, CheckCircle, DollarSign, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

type RunStatus = 'DRAFT' | 'APPROVED' | 'PAID'
type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
type PaymentMethod = 'BANK' | 'MOMO' | 'CASH'

interface PayrollLine {
  id: string
  basicSalary: number
  allowances: number
  overtime: number
  bonus: number
  grossPay: number
  ssfEmployee: number
  ssfEmployer: number
  taxableIncome: number
  paye: number
  otherDeductions: number
  netPay: number
  employee: {
    id: string
    name: string
    staffId: string
    position: string
    department: string | null
    employmentType: EmploymentType
  }
}

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
  journalEntryId: string | null
  createdAt: string
  approvedAt: string | null
  paidAt: string | null
  createdBy:  { name: string } | null
  approvedBy: { name: string } | null
  paidBy:     { name: string } | null
  lines: PayrollLine[]
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const STATUS_STYLES: Record<RunStatus, string> = {
  DRAFT:    'bg-yellow-100 text-yellow-700 border-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-300',
  PAID:     'bg-green-100 text-green-700 border-green-300',
}

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actioning, setActioning] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/payroll/runs/${id}`)
      if (!res.ok) throw new Error()
      setRun(await res.json())
    } catch {
      setError('Failed to load payroll run')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const doAction = async (action: 'approve' | 'pay') => {
    setActioning(true)
    setActionError('')
    try {
      const res = await fetch(`/api/payroll/runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'pay' ? { paymentMethod } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setActionError(data.error ?? 'Action failed'); return }
      load()
    } catch {
      setActionError('Action failed. Please try again.')
    } finally {
      setActioning(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/payroll/runs/${id}`, { method: 'DELETE' })
      if (res.ok) router.push('/payroll/runs')
      else {
        const d = await res.json()
        setActionError(d.error ?? 'Delete failed')
        setConfirmDelete(false)
      }
    } catch {
      setActionError('Delete failed')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <AppLayout><div className="p-12 text-center text-gray-400">Loading…</div></AppLayout>
  if (error || !run) return <AppLayout><div className="p-12 text-center text-red-600">{error || 'Run not found'}</div></AppLayout>

  const periodLabel = `${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear}`

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/payroll/runs')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="bg-green-100 p-3 rounded-lg">
            <Briefcase className="w-8 h-8 text-green-700" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Payroll — {periodLabel}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-bold border ${STATUS_STYLES[run.status]}`}>
                {run.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {run.lines.length} employee{run.lines.length !== 1 ? 's' : ''}
              {run.createdBy && ` · Created by ${run.createdBy.name}`}
              {run.approvedBy && ` · Approved by ${run.approvedBy.name}`}
              {run.paidBy && ` · Paid by ${run.paidBy.name}`}
            </p>
          </div>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-red-700 font-medium text-sm">
            {actionError}
          </div>
        )}

        {/* Totals summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Gross Pay',    value: run.totalGross,         color: 'text-gray-900' },
            { label: 'SSF Employee', value: run.totalSSFEmployee,   color: 'text-orange-600' },
            { label: 'SSF Employer', value: run.totalSSFEmployer,   color: 'text-orange-700' },
            { label: 'PAYE Tax',     value: run.totalPAYE,          color: 'text-red-600' },
            { label: 'Other Ded.',   value: run.totalOtherDeductions, color: 'text-gray-500' },
            { label: 'Net Pay',      value: run.totalNetPay,        color: 'text-green-700 font-extrabold' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        {run.status !== 'PAID' && (
          <div className="flex flex-wrap items-center gap-3">
            {run.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => doAction('approve')}
                  disabled={actioning}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50 active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  {actioning ? 'Approving…' : 'Approve Run'}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={actioning}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-lg transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Draft
                </button>
              </>
            )}
            {run.status === 'APPROVED' && (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={actioning}
                  className="border-2 border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-green-500 disabled:opacity-50"
                >
                  <option value="BANK">Disburse from Bank</option>
                  <option value="MOMO">Disburse from MoMo</option>
                  <option value="CASH">Disburse from Cash</option>
                </select>
                <button
                  onClick={() => doAction('pay')}
                  disabled={actioning}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50 active:scale-95"
                >
                  <DollarSign className="w-4 h-4" />
                  {actioning ? 'Processing…' : 'Disburse Payroll'}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 ml-auto">
              {run.status === 'DRAFT'
                ? 'Review the breakdown below before approving.'
                : 'Disbursing payroll credits the selected cash/bank account and books the statutory liabilities.'}
            </p>
          </div>
        )}

        {run.status === 'PAID' && run.journalEntryId && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-sm text-green-800">
            Payroll disbursed and journal entry posted ·{' '}
            <Link href={`/accounting/journal/${run.journalEntryId}`} className="font-mono underline underline-offset-2">
              View entry
            </Link>
          </div>
        )}

        {/* Per-employee breakdown */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200">
            <h2 className="font-bold text-gray-900">Employee Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-600">Employee</th>
                  <th className="text-left px-4 py-2.5 font-bold text-gray-600">Dept</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">Basic</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">Allow.</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">OT/Bonus</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">Gross</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">SSF Emp.</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">PAYE</th>
                  <th className="text-right px-4 py-2.5 font-bold text-gray-600">Other</th>
                  <th className="text-right px-4 py-2.5 font-bold text-green-700">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {run.lines.map(line => (
                  <tr key={line.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-900">{line.employee.name}</p>
                      <p className="text-xs text-gray-400">{line.employee.staffId} · {line.employee.position}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{line.employee.department ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(line.basicSalary)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">{formatCurrency(line.allowances)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">{formatCurrency(line.overtime + line.bonus)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(line.grossPay)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-600">{formatCurrency(line.ssfEmployee)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600">{formatCurrency(line.paye)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-400">{formatCurrency(line.otherDeductions)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700">{formatCurrency(line.netPay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 font-bold text-gray-700">Totals</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono">{formatCurrency(run.totalGross)}</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-orange-600">{formatCurrency(run.totalSSFEmployee)}</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-red-600">{formatCurrency(run.totalPAYE)}</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-gray-400">{formatCurrency(run.totalOtherDeductions)}</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-green-700">{formatCurrency(run.totalNetPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Employer SSF note */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Employer SSF Contribution (not deducted from employee pay)</p>
          <p className="text-xs text-amber-700">
            Your total employer SSF contribution for {periodLabel} is{' '}
            <span className="font-bold">{formatCurrency(run.totalSSFEmployer)}</span> (13% of gross basic salaries).
            This is an additional business cost on top of the net pay disbursed to employees.
          </p>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Delete Draft Run?</h2>
            <p className="text-sm text-gray-600">
              This will permanently delete the {periodLabel} payroll draft and all computed lines.
              No data will be posted to accounting.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
