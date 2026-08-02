'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight, Layers } from 'lucide-react'

interface FeatureModule {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  isActive: boolean
  setupFee: number
  monthlyFee: number
  yearlyFee: number
  oneTimeFee: number
  discount: number
  commissionRate: number
  vatRate: number
  sortOrder: number
}

type EditForm = Omit<FeatureModule, 'id' | 'isActive'>

const EMPTY_FORM: EditForm = {
  key: '', name: '', description: '', category: 'Module',
  setupFee: 0, monthlyFee: 0, yearlyFee: 0, oneTimeFee: 0,
  discount: 0, commissionRate: 0, vatRate: 0, sortOrder: 99,
}

const CATEGORIES = ['Module', 'Add-on', 'Service']

export default function ModuleSetupPage() {
  const [modules, setModules] = useState<FeatureModule[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<EditForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/feature-modules')
    const data = await r.json()
    setModules(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(m: FeatureModule) {
    setEditId(m.id)
    setShowCreate(false)
    setForm({
      key: m.key, name: m.name, description: m.description ?? '',
      category: m.category, setupFee: m.setupFee, monthlyFee: m.monthlyFee,
      yearlyFee: m.yearlyFee, oneTimeFee: m.oneTimeFee, discount: m.discount,
      commissionRate: m.commissionRate, vatRate: m.vatRate, sortOrder: m.sortOrder,
    })
    setMessage(null)
  }

  function cancelEdit() { setEditId(null); setShowCreate(false); setForm(EMPTY_FORM); setMessage(null) }

  async function handleSave(id: string | null) {
    setSaving(true)
    setMessage(null)
    try {
      const url = id ? `/api/admin/feature-modules/${id}` : '/api/admin/feature-modules'
      const method = id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save' })
      } else {
        setMessage({ type: 'success', text: id ? 'Module updated.' : 'Module created.' })
        cancelEdit()
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(m: FeatureModule) {
    await fetch(`/api/admin/feature-modules/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    load()
  }

  const byCategory = modules.reduce<Record<string, FeatureModule[]>>((acc, m) => {
    ;(acc[m.category] ??= []).push(m)
    return acc
  }, {})

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Business Module Setup</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure features, pricing, commissions, and VAT for all billable modules.</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditId(null); setForm(EMPTY_FORM); setMessage(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Module
          </button>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {message.text}
          </div>
        )}

        {showCreate && (
          <ModuleForm
            form={form} setForm={setForm} saving={saving}
            onSave={() => handleSave(null)} onCancel={cancelEdit}
            title="New Module"
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
          </div>
        ) : (
          Object.entries(byCategory).map(([cat, mods]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-indigo-500" />
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{cat}s</h2>
              </div>
              <div className="bg-white border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {mods.map((m) => (
                  editId === m.id ? (
                    <div key={m.id} className="p-5">
                      <ModuleForm
                        form={form} setForm={setForm} saving={saving}
                        onSave={() => handleSave(m.id)} onCancel={cancelEdit}
                        title={`Edit: ${m.name}`}
                      />
                    </div>
                  ) : (
                    <div key={m.id} className={`flex items-start gap-4 px-5 py-4 ${!m.isActive ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                          <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 ">{m.key}</span>
                          {!m.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 -full">Inactive</span>}
                        </div>
                        {m.description && <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                          {m.setupFee > 0 && <span>Setup: <strong>GHS {m.setupFee.toFixed(2)}</strong></span>}
                          {m.monthlyFee > 0 && <span>Monthly: <strong>GHS {m.monthlyFee.toFixed(2)}</strong></span>}
                          {m.yearlyFee > 0 && <span>Yearly: <strong>GHS {m.yearlyFee.toFixed(2)}</strong></span>}
                          {m.oneTimeFee > 0 && <span>One-time: <strong>GHS {m.oneTimeFee.toFixed(2)}</strong></span>}
                          {m.discount > 0 && <span>Discount: <strong>{m.discount}%</strong></span>}
                          {m.commissionRate > 0 && <span className="text-emerald-600">Commission: <strong>{m.commissionRate}%</strong></span>}
                          {m.vatRate > 0 && <span>VAT: <strong>{m.vatRate}%</strong></span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleActive(m)} title={m.isActive ? 'Deactivate' : 'Activate'} className="text-gray-400 hover:text-indigo-600 transition-colors">
                          {m.isActive ? <ToggleRight className="w-5 h-5 text-indigo-600" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button onClick={() => startEdit(m)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  )
}

function ModuleForm({
  form, setForm, saving, onSave, onCancel, title,
}: {
  form: EditForm
  setForm: (f: EditForm) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
  title: string
}) {
  const f = (field: keyof EditForm, value: string | number) =>
    setForm({ ...form, [field]: value })

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Module Key *</label>
          <input value={form.key} onChange={(e) => f('key', e.target.value)} placeholder="e.g. pos, payroll" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="e.g. POS Module" className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input value={form.description ?? ''} onChange={(e) => f('description', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select value={form.category} onChange={(e) => f('category', e.target.value)} className={INPUT}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
          <input type="number" value={form.sortOrder} onChange={(e) => f('sortOrder', parseFloat(e.target.value) || 0)} className={INPUT} />
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Pricing (GHS)</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['setupFee', 'monthlyFee', 'yearlyFee', 'oneTimeFee'] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{field.replace(/Fee/, ' Fee').replace(/([A-Z])/g, ' $1').trim()}</label>
            <input type="number" min="0" step="0.01" value={form[field]} onChange={(e) => f(field, parseFloat(e.target.value) || 0)} className={INPUT} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Discount %</label>
          <input type="number" min="0" max="100" value={form.discount} onChange={(e) => f('discount', parseFloat(e.target.value) || 0)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Commission %</label>
          <input type="number" min="0" max="100" value={form.commissionRate} onChange={(e) => f('commissionRate', parseFloat(e.target.value) || 0)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label>
          <input type="number" min="0" max="100" value={form.vatRate} onChange={(e) => f('vatRate', parseFloat(e.target.value) || 0)} className={INPUT} />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5">
          <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 flex items-center gap-1.5">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  )
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
