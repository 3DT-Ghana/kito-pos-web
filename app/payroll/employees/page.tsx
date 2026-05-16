'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Users, Plus, X, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
type SsfTier = 'TIER1' | 'TIER2' | 'TIER3'

interface Employee {
  id: string
  staffId: string
  name: string
  email: string | null
  phone: string | null
  position: string
  department: string | null
  employmentType: EmploymentType
  basicSalary: number
  ssfTier: SsfTier
  isExemptFromPAYE: boolean
  bankName: string | null
  bankBranch: string | null
  accountNumber: string | null
  isActive: boolean
  hireDate: string
}

const EMPTY_FORM = {
  staffId: '', name: '', email: '', phone: '',
  position: '', department: '', employmentType: 'FULL_TIME' as EmploymentType,
  basicSalary: '', ssfTier: 'TIER1' as SsfTier, isExemptFromPAYE: false,
  bankName: '', bankBranch: '', accountNumber: '',
  hireDate: new Date().toISOString().slice(0, 10),
}

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full Time', PART_TIME: 'Part Time', CONTRACT: 'Contract',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [deptFilter, setDeptFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ activeOnly: String(activeOnly) })
      if (deptFilter) params.set('department', deptFilter)
      const res = await fetch(`/api/payroll/employees?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setEmployees(data.employees)
    } catch {
      setError('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [activeOnly, deptFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (emp: Employee) => {
    setEditId(emp.id)
    setForm({
      staffId: emp.staffId,
      name: emp.name,
      email: emp.email ?? '',
      phone: emp.phone ?? '',
      position: emp.position,
      department: emp.department ?? '',
      employmentType: emp.employmentType,
      basicSalary: String(emp.basicSalary),
      ssfTier: emp.ssfTier,
      isExemptFromPAYE: emp.isExemptFromPAYE,
      bankName: emp.bankName ?? '',
      bankBranch: emp.bankBranch ?? '',
      accountNumber: emp.accountNumber ?? '',
      hireDate: emp.hireDate.slice(0, 10),
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const url    = editId ? `/api/payroll/employees/${editId}` : '/api/payroll/employees'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basicSalary: parseFloat(form.basicSalary),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Failed to save'); return }
      setShowForm(false)
      load()
    } catch {
      setFormError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (emp: Employee) => {
    try {
      const res = await fetch(`/api/payroll/employees/${emp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !emp.isActive }),
      })
      if (res.ok) load()
    } catch { /* silent */ }
  }

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))] as string[]

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-8 h-8 text-blue-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
              <p className="text-gray-600 mt-1">Manage your payroll employee records</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e => setActiveOnly(e.target.checked)}
              className="rounded"
            />
            Active only
          </label>
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="border-2 border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <span className="text-sm text-gray-500 ml-auto">{employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading employees…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-600">{error}</div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-semibold">No employees found</p>
              <p className="text-sm mt-1">Add your first employee to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Staff ID</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Name</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Position</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Department</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Type</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-700">Basic Salary</th>
                    <th className="text-center px-4 py-3 font-bold text-gray-700">Status</th>
                    <th className="text-center px-4 py-3 font-bold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-600">{emp.staffId}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{emp.name}</td>
                      <td className="px-4 py-3 text-gray-700">{emp.position}</td>
                      <td className="px-4 py-3 text-gray-500">{emp.department ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          {EMPLOYMENT_LABELS[emp.employmentType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(emp.basicSalary)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${emp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {emp.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(emp)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition ${emp.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                          >
                            {emp.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add / Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">{editId ? 'Edit Employee' : 'Add Employee'}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {formError && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Staff ID *</label>
                    <input
                      type="text"
                      value={form.staffId}
                      onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                      disabled={!!editId}
                      required
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                      placeholder="e.g. EMP-001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      required
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Position *</label>
                    <input
                      type="text"
                      value={form.position}
                      onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                      required
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g. Sales, Finance"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Employment Type</label>
                    <select
                      value={form.employmentType}
                      onChange={e => setForm(f => ({ ...f, employmentType: e.target.value as EmploymentType }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="FULL_TIME">Full Time</option>
                      <option value="PART_TIME">Part Time</option>
                      <option value="CONTRACT">Contract</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Basic Salary (GHS) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.basicSalary}
                      onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))}
                      required
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">SSF Tier</label>
                    <select
                      value={form.ssfTier}
                      onChange={e => setForm(f => ({ ...f, ssfTier: e.target.value as SsfTier }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    >
                      {form.ssfTier !== 'TIER1' && (
                        <option value={form.ssfTier}>{form.ssfTier} (legacy unsupported tier)</option>
                      )}
                      <option value="TIER1">Tier 1 (SSNIT — 5.5% employee / 13% employer)</option>
                    </select>
                    <p className="mt-1 text-xs text-amber-700">
                      Payroll calculations currently support Tier 1 employees only. Legacy non-Tier-1 records should be migrated before running payroll.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Hire Date</label>
                    <input
                      type="date"
                      value={form.hireDate}
                      onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isExemptFromPAYE}
                    onChange={e => setForm(f => ({ ...f, isExemptFromPAYE: e.target.checked }))}
                    className="rounded"
                  />
                  Exempt from PAYE (e.g. income below tax threshold)
                </label>

                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2">Bank Details (Optional)</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={form.bankName}
                      onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Branch</label>
                    <input
                      type="text"
                      value={form.bankBranch}
                      onChange={e => setForm(f => ({ ...f, bankBranch: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={form.accountNumber}
                      onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                      className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-gray-200">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Employee'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
