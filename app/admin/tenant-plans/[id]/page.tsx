'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminLayout } from '@/components/layout/AdminLayout'
import Link from 'next/link'
import { ChevronLeft, CheckCircle, FileText, Plus, X, Trash2, Receipt, RefreshCw } from 'lucide-react'

interface FeatureModule {
  id: string; key: string; name: string; category: string
  monthlyFee: number; yearlyFee: number; oneTimeFee: number; setupFee: number
  commissionRate: number; vatRate: number; isActive: boolean
}
interface BusinessItem {
  id: string; name: string; sellingPrice: number; commissionRate: number; vatRate: number; billingCycle: string
}
interface PlanFeature {
  id: string; featureId: string; monthlyFee: number | null; yearlyFee: number | null
  oneTimeFee: number | null; setupFee: number | null; discount: number | null
  feature: FeatureModule
}
interface PlanItem {
  id: string; itemId: string; quantity: number; unitPrice: number | null; discount: number | null
  item: BusinessItem
}
interface Invoice {
  id: string; invoiceNumber: string; total: number; status: string; createdAt: string
}
interface Plan {
  id: string; tenantId: string; name: string | null; billingCycle: string; discount: number; notes: string | null
  features: PlanFeature[]; items: PlanItem[]; invoices: Invoice[]
  tenant: { id: string; name: string; status: string; agentId: string | null } | null
}

const CYCLE = ['MONTHLY', 'YEARLY', 'ONE_TIME']

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-400',
}

export default function TenantPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [allModules, setAllModules] = useState<FeatureModule[]>([])
  const [allItems, setAllItems] = useState<BusinessItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
    href?: string
    actionLabel?: string
  } | null>(null)

  // Draft form state
  const [draftName, setDraftName] = useState('')
  const [draftCycle, setDraftCycle] = useState('MONTHLY')
  const [draftDiscount, setDraftDiscount] = useState(0)
  const [draftNotes, setDraftNotes] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [selectedItems, setSelectedItems] = useState<{ itemId: string; quantity: number }[]>([])

  async function load() {
    const [planRes, modRes, itemRes] = await Promise.all([
      fetch(`/api/admin/tenant-plans/${id}`),
      fetch('/api/admin/feature-modules'),
      fetch('/api/admin/business-items'),
    ])
    const [planData, modData, itemData] = await Promise.all([planRes.json(), modRes.json(), itemRes.json()])

    if (!planRes.ok) {
      // No plan yet — still show the form to create one
      setPlan(null)
    } else {
      setPlan(planData)
      setDraftName(planData.name ?? '')
      setDraftCycle(planData.billingCycle ?? 'MONTHLY')
      setDraftDiscount(planData.discount ?? 0)
      setDraftNotes(planData.notes ?? '')
      setSelectedFeatures(planData.features.map((f: PlanFeature) => f.featureId))
      setSelectedItems(planData.items.map((i: PlanItem) => ({ itemId: i.itemId, quantity: i.quantity })))
    }

    setAllModules(Array.isArray(modData) ? modData.filter((m: FeatureModule) => m.isActive) : [])
    setAllItems(Array.isArray(itemData) ? itemData.filter((i: BusinessItem & { isActive?: boolean }) => i.isActive !== false) : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  function toggleFeature(featureId: string) {
    setSelectedFeatures((prev) =>
      prev.includes(featureId) ? prev.filter((x) => x !== featureId) : [...prev, featureId]
    )
  }

  function addItem(itemId: string) {
    if (!selectedItems.find((i) => i.itemId === itemId)) {
      setSelectedItems((prev) => [...prev, { itemId, quantity: 1 }])
    }
  }

  function removeItem(itemId: string) {
    setSelectedItems((prev) => prev.filter((i) => i.itemId !== itemId))
  }

  function updateItemQty(itemId: string, quantity: number) {
    setSelectedItems((prev) => prev.map((i) => i.itemId === itemId ? { ...i, quantity: Math.max(1, quantity) } : i))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/tenant-plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: id,
          name: draftName || undefined,
          billingCycle: draftCycle,
          discount: draftDiscount,
          notes: draftNotes || null,
          features: selectedFeatures.map((featureId) => ({ featureId })),
          items: selectedItems,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save' })
      } else {
        setMessage({ type: 'success', text: 'Plan saved. Tenant features updated.' })
        setPlan(data)
      }
    } finally {
      setSaving(false)
    }
  }

  async function generateInvoice() {
    setGenLoading(true)
    setMessage(null)
    try {
      const tenantId = plan?.tenantId ?? id
      const res = await fetch(`/api/admin/tenant-plans/${tenantId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({
          type: 'error',
          text: data.error ?? 'Failed to generate invoice',
          href: data.existingDraftInvoiceId
            ? `/admin/invoices/${data.existingDraftInvoiceId}`
            : undefined,
          actionLabel: data.existingDraftInvoiceNumber
            ? `Open ${data.existingDraftInvoiceNumber}`
            : 'Open draft invoice',
        })
      } else {
        setMessage({ type: 'success', text: `Invoice ${data.invoiceNumber} created.` })
        load()
      }
    } finally {
      setGenLoading(false)
    }
  }

  const byCategory = allModules.reduce<Record<string, FeatureModule[]>>((acc, m) => {
    ;(acc[m.category] ??= []).push(m)
    return acc
  }, {})

  const tenantName = plan?.tenant?.name ?? id
  const existingDraftInvoice =
    plan?.invoices.find((invoice) => invoice.status === 'DRAFT') ?? null

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link href="/admin/tenant-plans" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back to Plans
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tenantName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Business Plan Setup</p>
            </div>
            {plan && (
              existingDraftInvoice ? (
                <Link
                  href={`/admin/invoices/${existingDraftInvoice.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm font-medium hover:bg-indigo-100 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Open Draft Invoice
                </Link>
              ) : (
                <button
                  onClick={generateInvoice}
                  disabled={genLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  <Receipt className="w-4 h-4" />
                  {genLoading ? 'Generating…' : 'Generate Invoice'}
                </button>
              )
            )}
          </div>
          {existingDraftInvoice && (
            <p className="text-xs text-amber-600 mt-2">
              A draft invoice already exists for this plan. Open or void it before generating another one.
            </p>
          )}
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            <span>{message.text}</span>
            {message.href && (
              <Link href={message.href} className="ml-2 font-medium underline">
                {message.actionLabel ?? 'Open draft invoice'} →
              </Link>
            )}
          </div>
        )}

        {/* Plan settings */}
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Plan Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plan Name</label>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={`${tenantName} Plan`} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing Cycle</label>
              <select value={draftCycle} onChange={(e) => setDraftCycle(e.target.value)} className={INPUT}>
                {CYCLE.map((c) => <option key={c} value={c}>{c.replace('_', '-')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plan Discount %</label>
              <input type="number" min="0" max="100" value={draftDiscount} onChange={(e) => setDraftDiscount(parseFloat(e.target.value) || 0)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} className={INPUT} />
            </div>
          </div>
        </div>

        {/* Feature modules */}
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Feature Modules</h2>
            <span className="text-xs text-indigo-600 font-semibold">{selectedFeatures.length} selected</span>
          </div>
          {Object.entries(byCategory).map(([cat, mods]) => (
            <div key={cat}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{cat}s</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mods.map((m) => {
                  const checked = selectedFeatures.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleFeature(m.id)}
                      className={`flex items-start gap-3 p-3 border text-left transition-all ${checked ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                        {checked && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {draftCycle === 'MONTHLY' && m.monthlyFee > 0 && `GHS ${m.monthlyFee.toFixed(2)}/mo`}
                          {draftCycle === 'YEARLY' && m.yearlyFee > 0 && `GHS ${m.yearlyFee.toFixed(2)}/yr`}
                          {draftCycle === 'ONE_TIME' && m.oneTimeFee > 0 && `GHS ${m.oneTimeFee.toFixed(2)} once`}
                          {m.setupFee > 0 && ` + GHS ${m.setupFee.toFixed(2)} setup`}
                          {m.commissionRate > 0 && ` · ${m.commissionRate}% commission`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Hardware / Items */}
        <div className="bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Hardware & Items</h2>

          {selectedItems.length > 0 && (
            <div className="space-y-2">
              {selectedItems.map(({ itemId, quantity }) => {
                const item = allItems.find((i) => i.id === itemId)
                if (!item) return null
                return (
                  <div key={itemId} className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">GHS {item.sellingPrice.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Qty</label>
                      <input
                        type="number" min="1" value={quantity}
                        onChange={(e) => updateItemQty(itemId, parseInt(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button onClick={() => removeItem(itemId)} className="p-1 text-red-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {allItems.filter((i) => !selectedItems.find((s) => s.itemId === i.id)).length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Add items:</p>
              <div className="flex flex-wrap gap-2">
                {allItems
                  .filter((i) => !selectedItems.find((s) => s.itemId === i.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addItem(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> {item.name} — GHS {item.sellingPrice.toFixed(2)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle className="w-4 h-4" /> Save Plan</>}
          </button>
        </div>

        {/* Recent invoices */}
        {plan && plan.invoices.length > 0 && (
          <div className="bg-white border border-gray-200 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" /> Recent Invoices
              </h2>
              <Link href={`/admin/invoices?tenantId=${plan.tenantId}`} className="text-xs text-indigo-600 hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {plan.invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/admin/invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-mono text-gray-700">{inv.invoiceNumber}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">GHS {inv.total.toFixed(2)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[inv.status] ?? 'bg-gray-100'}`}>
                      {inv.status}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(inv.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick delete */}
        {plan && (
          <div className="flex items-center justify-between bg-red-50 border border-red-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-red-700">Danger Zone</p>
              <p className="text-xs text-red-500 mt-0.5">Removing all features will disable the tenant&apos;s access to all modules.</p>
            </div>
            <button
              onClick={() => {
                if (!confirm('Remove all features from this plan?')) return
                setSelectedFeatures([])
                setSelectedItems([])
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Plan
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
