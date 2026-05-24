'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Settings2, Plus, X, Pencil, Check, ToggleLeft, ToggleRight } from 'lucide-react'

interface PayrollComponent {
  id: string; name: string; type: 'ALLOWANCE' | 'DEDUCTION'; subType: string | null
  isTaxable: boolean; isBeforeTax: boolean; isActive: boolean; createdAt: string
}

const EMPTY_FORM = { name: '', type: 'ALLOWANCE' as 'ALLOWANCE' | 'DEDUCTION', subType: '', isTaxable: false, isBeforeTax: true }

export default function PayrollComponentsPage() {
  const [components, setComponents] = useState<PayrollComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PayrollComponent | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/payroll/components')
    if (r.ok) setComponents(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setError(null)
    setShowModal(true)
  }

  function openEdit(c: PayrollComponent) {
    setEditing(c)
    setForm({ name: c.name, type: c.type, subType: c.subType ?? '', isTaxable: c.isTaxable, isBeforeTax: c.isBeforeTax })
    setError(null)
    setShowModal(true)
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const url = editing ? `/api/payroll/components/${editing.id}` : '/api/payroll/components'
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, subType: form.subType || null }),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error ?? 'Save failed'); return }
    setShowModal(false)
    load()
  }

  async function toggleActive(c: PayrollComponent) {
    await fetch(`/api/payroll/components/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    load()
  }

  const allowances = components.filter((c) => c.type === 'ALLOWANCE')
  const deductions = components.filter((c) => c.type === 'DEDUCTION')

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Payroll Components</h1>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Component
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {[{ label: 'Allowances', items: allowances }, { label: 'Deductions', items: deductions }].map(({ label, items }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
                  <span className="text-xs text-gray-400">{items.length} component{items.length !== 1 ? 's' : ''}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400 px-5 py-4">No {label.toLowerCase()} defined yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-5 py-2 text-left font-semibold">Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Sub-type</th>
                        <th className="px-3 py-2 text-center font-semibold">{label === 'Allowances' ? 'Taxable' : 'Before Tax'}</th>
                        <th className="px-3 py-2 text-center font-semibold">Status</th>
                        <th className="px-5 py-2 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {items.map((c) => (
                        <tr key={c.id} className={!c.isActive ? 'opacity-50' : ''}>
                          <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                          <td className="px-3 py-3 text-gray-500">{c.subType ?? '—'}</td>
                          <td className="px-3 py-3 text-center">
                            {label === 'Allowances'
                              ? (c.isTaxable ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Taxable</span> : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non-taxable</span>)
                              : (c.isBeforeTax ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Before PAYE</span> : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">After PAYE</span>)
                            }
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                              {c.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => toggleActive(c)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded" title={c.isActive ? 'Deactivate' : 'Activate'}>
                                {c.isActive ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Component' : 'New Component'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Housing Allowance" />
              </div>

              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type *</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'ALLOWANCE' | 'DEDUCTION' }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="ALLOWANCE">Allowance</option>
                    <option value="DEDUCTION">Deduction</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sub-type (optional)</label>
                <input value={form.subType} onChange={(e) => setForm((f) => ({ ...f, subType: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. TRANSPORT, HOUSING" />
              </div>

              {form.type === 'ALLOWANCE' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm((f) => ({ ...f, isTaxable: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" />
                  <span className="text-sm text-gray-700">Taxable allowance (adds to PAYE chargeable income)</span>
                </label>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isBeforeTax} onChange={(e) => setForm((f) => ({ ...f, isBeforeTax: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" />
                  <span className="text-sm text-gray-700">Deduct before PAYE (reduces chargeable income)</span>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
