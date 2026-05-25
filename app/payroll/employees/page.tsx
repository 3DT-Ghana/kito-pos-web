'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Users, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { Pagination } from '@/components/ui/Pagination'

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
type SsfTier = 'TIER1' | 'TIER2' | 'TIER3'

interface Employee {
  id: string; staffId: string
  firstName: string; middleName: string | null; lastName: string
  gender: string | null; dateOfBirth: string | null; tinNumber: string | null; ssnitNumber: string | null
  residentialAddress: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null
  email: string | null; phone: string | null; position: string; department: string | null
  employmentType: EmploymentType; basicSalary: number; ssfTier: SsfTier; isExemptFromPAYE: boolean
  bankName: string | null; bankBranch: string | null; accountNumber: string | null
  momoProvider: string | null; momoNumber: string | null; momoAccountName: string | null
  isActive: boolean; hireDate: string
}

const EMPTY_FORM = {
  staffId: '', firstName: '', middleName: '', lastName: '', gender: '', dateOfBirth: '',
  tinNumber: '', ssnitNumber: '', residentialAddress: '', emergencyContactName: '', emergencyContactPhone: '',
  email: '', phone: '', position: '', department: '',
  employmentType: 'FULL_TIME' as EmploymentType, basicSalary: '',
  ssfTier: 'TIER1' as SsfTier, isExemptFromPAYE: false,
  bankName: '', bankBranch: '', accountNumber: '',
  momoProvider: '', momoNumber: '', momoAccountName: '',
  hireDate: new Date().toISOString().slice(0, 10),
}

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full Time', PART_TIME: 'Part Time', CONTRACT: 'Contract',
}

type Tab = 'personal' | 'employment' | 'payment'

const INPUT = 'w-full border-2 border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
const LABEL = 'block text-sm font-bold text-gray-700 mb-1'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [deptFilter, setDeptFilter] = useState('')
  const [tab, setTab] = useState<Tab>('personal')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Departments
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [newDeptName, setNewDeptName] = useState('')
  const [addingDept, setAddingDept] = useState(false)
  const [showDeptInput, setShowDeptInput] = useState(false)

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/departments')
      if (!res.ok) return
      const data = await res.json()
      setDepartments(data.departments ?? [])
    } catch { /* non-critical */ }
  }, [])

  const handleAddDept = async () => {
    if (!newDeptName.trim()) return
    setAddingDept(true)
    try {
      const res = await fetch('/api/payroll/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setDepartments(prev => [...prev, data.department].sort((a, b) => a.name.localeCompare(b.name)))
        setForm(f => ({ ...f, department: data.department.name }))
        setNewDeptName('')
        setShowDeptInput(false)
      }
    } finally {
      setAddingDept(false)
    }
  }

  const handleDeleteDept = async (id: string, name: string) => {
    if (!confirm(`Delete department "${name}"? Employees assigned to it will keep the name but it won't appear in the list.`)) return
    await fetch(`/api/payroll/departments/${id}`, { method: 'DELETE' })
    setDepartments(prev => prev.filter(d => d.id !== id))
    if (form.department === name) setForm(f => ({ ...f, department: '' }))
  }

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

  useEffect(() => { load(); loadDepartments() }, [load, loadDepartments])
  useEffect(() => setPage(1), [activeOnly, deptFilter])

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setTab('personal')
    setShowForm(true)
  }

  const openEdit = (emp: Employee) => {
    setEditId(emp.id)
    setForm({
      staffId: emp.staffId,
      firstName: emp.firstName, middleName: emp.middleName ?? '', lastName: emp.lastName,
      gender: emp.gender ?? '', dateOfBirth: emp.dateOfBirth?.slice(0, 10) ?? '',
      tinNumber: emp.tinNumber ?? '', ssnitNumber: emp.ssnitNumber ?? '',
      residentialAddress: emp.residentialAddress ?? '',
      emergencyContactName: emp.emergencyContactName ?? '',
      emergencyContactPhone: emp.emergencyContactPhone ?? '',
      email: emp.email ?? '', phone: emp.phone ?? '',
      position: emp.position, department: emp.department ?? '',
      employmentType: emp.employmentType,
      basicSalary: String(emp.basicSalary),
      ssfTier: emp.ssfTier, isExemptFromPAYE: emp.isExemptFromPAYE,
      bankName: emp.bankName ?? '', bankBranch: emp.bankBranch ?? '',
      accountNumber: emp.accountNumber ?? '',
      momoProvider: emp.momoProvider ?? '', momoNumber: emp.momoNumber ?? '',
      momoAccountName: emp.momoAccountName ?? '',
      hireDate: emp.hireDate.slice(0, 10),
    })
    setFormError('')
    setTab('personal')
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
        body: JSON.stringify({ ...form, basicSalary: parseFloat(form.basicSalary) }),
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
    await fetch(`/api/payroll/employees/${emp.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !emp.isActive }),
    })
    load()
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3"><Users className="w-8 h-8 text-blue-700" /></div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
              <p className="text-gray-600 mt-1">Manage your payroll employee records</p>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow transition active:scale-95">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
            Active only
          </label>
          {departments.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="border-2 border-gray-300 px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-500">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          )}
          <span className="text-sm text-gray-500 ml-auto">{employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="bg-white shadow-sm border-2 border-gray-200 overflow-hidden">
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
                  {employees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(emp => (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-600">{emp.staffId}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{emp.firstName} {emp.lastName}</td>
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
                          <button onClick={() => openEdit(emp)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggleActive(emp)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition ${emp.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
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
        {employees.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{employees.length} results</span>
            <Pagination page={page} totalPages={Math.ceil(employees.length / PAGE_SIZE)} onPageChange={setPage} totalItems={employees.length} pageSize={PAGE_SIZE} />
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">{editId ? 'Edit Employee' : 'Add Employee'}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 transition"><X className="w-5 h-5" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 px-6">
                {(['personal', 'employment', 'payment'] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition capitalize ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t === 'personal' ? 'Personal' : t === 'employment' ? 'Employment' : 'Payment'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {formError && (
                  <div className="bg-red-50 border-2 border-red-200 p-3 text-sm text-red-700 font-medium">{formError}</div>
                )}

                {tab === 'personal' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={LABEL}>First Name *</label>
                        <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Middle Name</label>
                        <input value={form.middleName} onChange={e => setForm(f => ({ ...f, middleName: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Last Name *</label>
                        <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Gender</label>
                        <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={INPUT}>
                          <option value="">Select…</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Date of Birth</label>
                        <input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>TIN Number</label>
                        <input value={form.tinNumber} onChange={e => setForm(f => ({ ...f, tinNumber: e.target.value }))} className={INPUT} placeholder="Ghana Revenue Authority TIN" />
                      </div>
                      <div>
                        <label className={LABEL}>SSNIT Number</label>
                        <input value={form.ssnitNumber} onChange={e => setForm(f => ({ ...f, ssnitNumber: e.target.value }))} className={INPUT} placeholder="SSNIT membership number" />
                      </div>
                      <div>
                        <label className={LABEL}>Email</label>
                        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Phone</label>
                        <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT} />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL}>Residential Address</label>
                      <input value={form.residentialAddress} onChange={e => setForm(f => ({ ...f, residentialAddress: e.target.value }))} className={INPUT} placeholder="Full residential address" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Emergency Contact Name</label>
                        <input value={form.emergencyContactName} onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Emergency Contact Phone</label>
                        <input value={form.emergencyContactPhone} onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))} className={INPUT} />
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'employment' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Staff ID {!editId && <span className="font-normal text-gray-500">(auto if blank)</span>}</label>
                        <input value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                          disabled={!!editId} placeholder={editId ? '' : 'Leave blank to auto-generate'}
                          className={`${INPUT} disabled:bg-gray-50 disabled:text-gray-400`} />
                      </div>
                      <div>
                        <label className={LABEL}>Hire Date</label>
                        <input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Position *</label>
                        <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} required className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Department</label>
                        <div className="flex gap-2">
                          <select
                            value={form.department}
                            onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                            className={`${INPUT} flex-1`}
                          >
                            <option value="">— None —</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => { setShowDeptInput(v => !v); setNewDeptName('') }}
                            title="Add new department"
                            className="px-3 border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 font-bold text-lg transition"
                          >+</button>
                        </div>
                        {showDeptInput && (
                          <div className="mt-2 flex gap-2">
                            <input
                              autoFocus
                              value={newDeptName}
                              onChange={e => setNewDeptName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDept() } if (e.key === 'Escape') setShowDeptInput(false) }}
                              placeholder="New department name"
                              className={`${INPUT} flex-1`}
                            />
                            <button
                              type="button"
                              onClick={handleAddDept}
                              disabled={addingDept || !newDeptName.trim()}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition"
                            >{addingDept ? '…' : 'Add'}</button>
                            <button type="button" onClick={() => setShowDeptInput(false)} className="px-3 py-2 border-2 border-gray-300 text-gray-600 hover:bg-gray-50 transition">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {departments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {departments.map(d => (
                              <span key={d.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5">
                                {d.name}
                                <button type="button" onClick={() => handleDeleteDept(d.id, d.name)} className="text-gray-400 hover:text-red-500 transition">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={LABEL}>Employment Type</label>
                        <select value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value as EmploymentType }))} className={INPUT}>
                          <option value="FULL_TIME">Full Time</option>
                          <option value="PART_TIME">Part Time</option>
                          <option value="CONTRACT">Contract</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Basic Salary (GHS) *</label>
                        <input type="number" min="0" step="0.01" value={form.basicSalary}
                          onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} required className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>SSF Tier</label>
                        <select value={form.ssfTier} onChange={e => setForm(f => ({ ...f, ssfTier: e.target.value as SsfTier }))} className={INPUT}>
                          <option value="TIER1">Tier 1 (SSNIT — 5.5% / 13%)</option>
                          <option value="TIER2">Tier 2 (Occupational Pension)</option>
                          <option value="TIER3">Tier 3 (Voluntary Provident Fund)</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.isExemptFromPAYE} onChange={e => setForm(f => ({ ...f, isExemptFromPAYE: e.target.checked }))} className="rounded" />
                      Exempt from PAYE (e.g. income below tax threshold)
                    </label>
                  </div>
                )}

                {tab === 'payment' && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bank Details</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={LABEL}>Bank Name</label>
                        <input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Branch</label>
                        <input value={form.bankBranch} onChange={e => setForm(f => ({ ...f, bankBranch: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Account Number</label>
                        <input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} className={INPUT} />
                      </div>
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2">Mobile Money (MoMo)</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={LABEL}>Provider</label>
                        <select value={form.momoProvider} onChange={e => setForm(f => ({ ...f, momoProvider: e.target.value }))} className={INPUT}>
                          <option value="">None</option>
                          <option value="MTN">MTN MoMo</option>
                          <option value="VODAFONE">Vodafone Cash</option>
                          <option value="AIRTELTIGO">AirtelTigo Money</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>MoMo Number</label>
                        <input value={form.momoNumber} onChange={e => setForm(f => ({ ...f, momoNumber: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Account Name</label>
                        <input value={form.momoAccountName} onChange={e => setForm(f => ({ ...f, momoAccountName: e.target.value }))} className={INPUT} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200">
                  <div className="flex gap-2">
                    {tab !== 'personal' && (
                      <button type="button" onClick={() => setTab(tab === 'payment' ? 'employment' : 'personal')}
                        className="px-4 py-2 border-2 border-gray-300 font-semibold text-gray-700 hover:bg-gray-50 transition text-sm">
                        Back
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 border-2 border-gray-300 font-semibold text-gray-700 hover:bg-gray-50 transition">
                      Cancel
                    </button>
                    {tab !== 'payment' ? (
                      <button type="button" onClick={() => setTab(tab === 'personal' ? 'employment' : 'payment')}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow transition">
                        Next
                      </button>
                    ) : (
                      <button type="submit" disabled={saving}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow transition disabled:opacity-50">
                        {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Employee'}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
