'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { ShieldCheck, Pencil, X, Check } from 'lucide-react'

interface StatutoryDeduction {
  id: string; name: string; code: string; rate: number; appliesTo: string; isActive: boolean
}

export default function StatutoryDeductionsPage() {
  const [deductions, setDeductions] = useState<StatutoryDeduction[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<StatutoryDeduction | null>(null)
  const [form, setForm] = useState({ name: '', rate: '', appliesTo: 'BASIC' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/payroll/statutory')
    if (r.ok) setDeductions(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(d: StatutoryDeduction) {
    setEditing(d)
    setForm({ name: d.name, rate: String(d.rate), appliesTo: d.appliesTo })
    setError(null)
  }

  async function save() {
    if (!editing) return
    const rate = parseFloat(form.rate)
    if (isNaN(rate) || rate < 0 || rate > 100) { setError('Rate must be between 0 and 100'); return }
    setSaving(true)
    setError(null)
    const r = await fetch(`/api/payroll/statutory/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, rate, appliesTo: form.appliesTo }),
    })
    const data = await r.json()
    setSaving(false)
    if (!r.ok) { setError(data.error ?? 'Save failed'); return }
    setEditing(null)
    load()
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Statutory Deductions</h1>
            <p className="text-xs text-gray-500 mt-0.5">Configure SSF and other statutory rates for payroll calculation.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" /></div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Code</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Rate (%)</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Applies To</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deductions.map((d) => (
                  <tr key={d.id}>
                    {editing?.id === d.id ? (
                      <>
                        <td className="px-5 py-2" colSpan={3}>
                          {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
                          <div className="flex items-center gap-2">
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                              className="flex-1 text-sm border border-gray-300  px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                              type="number" step="0.1" min="0" max="100"
                              className="w-20 text-sm border border-gray-300  px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <select value={form.appliesTo} onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))}
                              className="text-sm border border-gray-300  px-2 py-1">
                              <option value="BASIC">Basic</option>
                              <option value="GROSS">Gross</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center" />
                        <td className="px-5 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={save} disabled={saving} className="p-1.5 text-emerald-600 hover:bg-emerald-50 ">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditing(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 ">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-3 font-medium text-gray-900">{d.name}</td>
                        <td className="px-3 py-3 text-gray-500 font-mono text-xs">{d.code}</td>
                        <td className="px-3 py-3 text-right font-semibold text-gray-900">{d.rate}%</td>
                        <td className="px-3 py-3 text-center text-gray-500">{d.appliesTo}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 ">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400">
          PAYE (Pay As You Earn) uses the GRA 2024 monthly tax bands and is computed automatically. SSF rates apply to basic salary by default.
        </p>
      </div>
    </AppLayout>
  )
}
