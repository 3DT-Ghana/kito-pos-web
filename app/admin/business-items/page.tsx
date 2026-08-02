'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight, Package } from 'lucide-react'

interface BusinessItem {
  id: string
  name: string
  description: string | null
  sellingPrice: number
  commissionRate: number
  billingCycle: 'ONE_TIME' | 'MONTHLY' | 'YEARLY'
  vatRate: number
  isActive: boolean
}

type EditForm = Omit<BusinessItem, 'id' | 'isActive'>

const EMPTY: EditForm = {
  name: '', description: '', sellingPrice: 0,
  commissionRate: 0, billingCycle: 'ONE_TIME', vatRate: 0,
}

const CYCLE_LABELS: Record<string, string> = {
  ONE_TIME: 'One-Time', MONTHLY: 'Monthly', YEARLY: 'Yearly',
}

export default function BusinessItemsPage() {
  const [items, setItems] = useState<BusinessItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<EditForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/business-items')
    const data = await r.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(item: BusinessItem) {
    setEditId(item.id)
    setShowCreate(false)
    setForm({ name: item.name, description: item.description ?? '', sellingPrice: item.sellingPrice, commissionRate: item.commissionRate, billingCycle: item.billingCycle, vatRate: item.vatRate })
    setMessage(null)
  }

  function cancelEdit() { setEditId(null); setShowCreate(false); setForm(EMPTY); setMessage(null) }

  async function handleSave(id: string | null) {
    setSaving(true)
    setMessage(null)
    try {
      const url = id ? `/api/admin/business-items/${id}` : '/api/admin/business-items'
      const res = await fetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setMessage({ type: 'error', text: data.error ?? 'Failed to save' }) }
      else { setMessage({ type: 'success', text: id ? 'Item updated.' : 'Item created.' }); cancelEdit(); load() }
    } finally { setSaving(false) }
  }

  async function toggleActive(item: BusinessItem) {
    await fetch(`/api/admin/business-items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !item.isActive }) })
    load()
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hardware & Business Items</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage billable hardware and physical items assigned to tenant plans.</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditId(null); setForm(EMPTY); setMessage(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {message.text}
          </div>
        )}

        {showCreate && (
          <div className="bg-white border border-gray-200 p-5">
            <ItemForm form={form} setForm={setForm} saving={saving} onSave={() => handleSave(null)} onCancel={cancelEdit} title="New Item" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent -full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 p-12 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No items yet. Add your first hardware or physical item.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {items.map((item) => (
              editId === item.id ? (
                <div key={item.id} className="p-5">
                  <ItemForm form={form} setForm={setForm} saving={saving} onSave={() => handleSave(item.id)} onCancel={cancelEdit} title={`Edit: ${item.name}`} />
                </div>
              ) : (
                <div key={item.id} className={`flex items-start gap-4 px-5 py-4 ${!item.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <span className={`text-xs px-2 py-0.5 -full font-medium ${item.billingCycle === 'ONE_TIME' ? 'bg-blue-50 text-blue-700' : item.billingCycle === 'MONTHLY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}`}>
                        {CYCLE_LABELS[item.billingCycle]}
                      </span>
                      {!item.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 -full">Inactive</span>}
                    </div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                      <span>Price: <strong>GHS {item.sellingPrice.toFixed(2)}</strong></span>
                      {item.commissionRate > 0 && <span className="text-emerald-600">Commission: <strong>{item.commissionRate}%</strong></span>}
                      {item.vatRate > 0 && <span>VAT: <strong>{item.vatRate}%</strong></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(item)} className="text-gray-400 hover:text-indigo-600 transition-colors">
                      {item.isActive ? <ToggleRight className="w-5 h-5 text-indigo-600" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function ItemForm({ form, setForm, saving, onSave, onCancel, title }: {
  form: EditForm; setForm: (f: EditForm) => void; saving: boolean
  onSave: () => void; onCancel: () => void; title: string
}) {
  const f = (field: keyof EditForm, val: string | number) => setForm({ ...form, [field]: val })
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="e.g. Receipt Printer" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Billing Cycle</label>
          <select value={form.billingCycle} onChange={(e) => f('billingCycle', e.target.value as EditForm['billingCycle'])} className={INPUT}>
            <option value="ONE_TIME">One-Time</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input value={form.description ?? ''} onChange={(e) => f('description', e.target.value)} className={INPUT} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price (GHS)</label>
          <input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => f('sellingPrice', parseFloat(e.target.value) || 0)} className={INPUT} />
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
      <div className="flex gap-2">
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
