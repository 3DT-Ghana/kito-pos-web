'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Landmark, Plus, X, Check } from 'lucide-react'

interface Employee { id: string; firstName: string; lastName: string; staffId: string }
interface Loan {
  id: string; description: string; principalAmount: number; balanceAmount: number
  monthlyDeduction: number; startDate: string; endDate: string | null; isActive: boolean
  employee: { id: string; firstName: string; lastName: string; staffId: string }
  _count: { repayments: number }
}

const EMPTY_FORM = { employeeId: '', description: '', principalAmount: '', monthlyDeduction: '', startDate: '', endDate: '' }

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = filterEmployee ? `/api/payroll/loans?employeeId=${filterEmployee}` : '/api/payroll/loans'
    const [loansRes, empsRes] = await Promise.all([fetch(url), fetch('/api/payroll/employees?activeOnly=false')])
    if (loansRes.ok) setLoans(await loansRes.json())
    if (empsRes.ok) {
      const d = await empsRes.json()
      setEmployees(d.employees ?? [])
    }
    setLoading(false)
  }, [filterEmployee])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.employeeId) { setError('Select an employee'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    const principal = parseFloat(form.principalAmount)
    const monthly = parseFloat(form.monthlyDeduction)
    if (isNaN(principal) || principal <= 0) { setError('Principal amount must be positive'); return }
    if (isNaN(monthly) || monthly <= 0) { setError('Monthly deduction must be positive'); return }
    if (!form.startDate) { setError('Start date is required'); return }

    setSaving(true)
    setError(null)
    const r = await fetch('/api/payroll/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: form.employeeId,
        description: form.description,
        principalAmount: principal,
        monthlyDeduction: monthly,
        startDate: form.startDate,
        endDate: form.endDate || null,
      }),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error ?? 'Failed to create loan'); return }
    setShowModal(false)
    setForm({ ...EMPTY_FORM })
    load()
  }

  async function closeLoan(id: string) {
    await fetch(`/api/payroll/loans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    load()
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Employee Loans</h1>
          </div>
          <button onClick={() => { setForm({ ...EMPTY_FORM }); setError(null); setShowModal(true) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Loan
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.staffId})</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : loans.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No loans found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left font-semibold">Employee</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Principal</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Monthly</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loans.map((loan) => (
                  <tr key={loan.id} className={!loan.isActive ? 'opacity-50' : ''}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{loan.employee.firstName} {loan.employee.lastName}</p>
                      <p className="text-xs text-gray-400">{loan.employee.staffId}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{loan.description}</td>
                    <td className="px-3 py-3 text-right text-gray-500">GHS {loan.principalAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">GHS {loan.balanceAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-gray-500">GHS {loan.monthlyDeduction.toFixed(2)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${loan.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {loan.isActive ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {loan.isActive && (
                        <button onClick={() => closeLoan(loan.id)} className="text-xs text-red-600 hover:underline">Close</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Employee Loan</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Employee *</label>
                <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select employee…</option>
                  {employees.filter((e) => e).map((e) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.staffId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Staff Welfare Loan" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Principal (GHS) *</label>
                  <input type="number" min="0" value={form.principalAmount} onChange={(e) => setForm((f) => ({ ...f, principalAmount: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Deduction (GHS) *</label>
                  <input type="number" min="0" value={form.monthlyDeduction} onChange={(e) => setForm((f) => ({ ...f, monthlyDeduction: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Create Loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
