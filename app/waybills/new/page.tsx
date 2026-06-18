'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useUser } from '@/hooks/useUser'

interface LineItem {
  description: string
  quantity: string
  unit: string
  weight: string
  notes: string
}

function emptyLine(): LineItem {
  return { description: '', quantity: '1', unit: 'pcs', weight: '', notes: '' }
}

function NewWaybillContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()

  const prefillSaleId    = searchParams.get('saleId') ?? ''
  const prefillConsignee = searchParams.get('consigneeName') ?? ''

  const [form, setForm] = useState({
    shipperName:      '',
    shipperAddress:   '',
    shipperPhone:     '',
    consigneeName:    prefillConsignee,
    consigneeAddress: '',
    consigneePhone:   '',
    driverName:       '',
    vehicleNumber:    '',
    carrierName:      '',
    notes:            '',
    saleId:           prefillSaleId,
  })
  const [items, setItems] = useState<LineItem[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [loadingFromSale, setLoadingFromSale] = useState(false)

  // Set shipper name once user is loaded
  useEffect(() => {
    if (user?.name) setForm(prev => ({ ...prev, shipperName: prev.shipperName || user.name! }))
  }, [user?.name])

  // Pre-fill from sale if saleId present
  useEffect(() => {
    if (!prefillSaleId) return
    setLoadingFromSale(true)
    fetch(`/api/sales/${prefillSaleId}`)
      .then(r => r.ok ? r.json() : null)
      .then((sale: {
        customer?: { name: string; phone?: string | null } | null
        items?: { quantity: number; price: number; item?: { name: string } | null }[]
      } | null) => {
        if (!sale) return
        setForm(prev => ({
          ...prev,
          consigneeName:  sale.customer?.name ?? prev.consigneeName,
          consigneePhone: sale.customer?.phone ?? '',
        }))
        if (sale.items && sale.items.length > 0) {
          setItems(sale.items.map(i => ({
            description: i.item?.name ?? 'Item',
            quantity:    String(i.quantity),
            unit:        'pcs',
            weight:      '',
            notes:       '',
          })))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFromSale(false))
  }, [prefillSaleId])

  function setField(k: keyof typeof form, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function setItem(i: number, k: keyof LineItem, v: string) {
    setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  }

  function addLine() { setItems(prev => [...prev, emptyLine()]) }
  function removeLine(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.shipperName.trim())      { setError('Shipper name is required'); return }
    if (!form.consigneeName.trim())    { setError('Consignee name is required'); return }
    if (!form.consigneeAddress.trim()) { setError('Consignee address is required'); return }
    if (items.length === 0)            { setError('Add at least one item'); return }
    for (const item of items) {
      if (!item.description.trim()) { setError('All items must have a description'); return }
      if (!Number(item.quantity) || Number(item.quantity) <= 0) {
        setError('All items must have a valid quantity'); return
      }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/waybills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          saleId: form.saleId.trim() || null,
          items: items.map(i => ({
            description: i.description.trim(),
            quantity:    Number(i.quantity),
            unit:        i.unit.trim() || 'pcs',
            weight:      i.weight.trim() ? Number(i.weight) : null,
            notes:       i.notes.trim() || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create waybill'); return }
      router.push(`/waybills/${data.id}`)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <Link href="/waybills" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Waybill</h1>
            <p className="text-sm text-gray-400">Create a delivery note for goods in transit</p>
          </div>
        </div>

        {prefillSaleId && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2">
            {loadingFromSale
              ? '⏳ Loading sale details…'
              : `✅ Pre-filled from Sale ${prefillSaleId.slice(0, 8).toUpperCase()}. Review and adjust before creating.`}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Shipper & Consignee */}
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 p-5 space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Shipper (Sender)</h3>
              <div>
                <label className={labelCls}>Name *</label>
                <input value={form.shipperName} onChange={e => setField('shipperName', e.target.value)} className={inputCls} placeholder="Your business name" />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input value={form.shipperAddress} onChange={e => setField('shipperAddress', e.target.value)} className={inputCls} placeholder="Shipper address" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={form.shipperPhone} onChange={e => setField('shipperPhone', e.target.value)} className={inputCls} placeholder="Shipper phone" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-5 space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Consignee (Recipient)</h3>
              <div>
                <label className={labelCls}>Name *</label>
                <input value={form.consigneeName} onChange={e => setField('consigneeName', e.target.value)} className={inputCls} placeholder="Recipient name" />
              </div>
              <div>
                <label className={labelCls}>Delivery Address *</label>
                <input value={form.consigneeAddress} onChange={e => setField('consigneeAddress', e.target.value)} className={inputCls} placeholder="Full delivery address" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={form.consigneePhone} onChange={e => setField('consigneePhone', e.target.value)} className={inputCls} placeholder="Recipient phone" />
              </div>
            </div>
          </div>

          {/* Carrier */}
          <div className="bg-white border border-gray-200 p-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Carrier / Logistics</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Driver Name</label>
                <input value={form.driverName} onChange={e => setField('driverName', e.target.value)} className={inputCls} placeholder="Driver full name" />
              </div>
              <div>
                <label className={labelCls}>Vehicle / Plate Number</label>
                <input value={form.vehicleNumber} onChange={e => setField('vehicleNumber', e.target.value)} className={inputCls} placeholder="e.g. GR-1234-24" />
              </div>
              <div>
                <label className={labelCls}>Transport Company</label>
                <input value={form.carrierName} onChange={e => setField('carrierName', e.target.value)} className={inputCls} placeholder="Carrier / logistics company" />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Goods / Items</h3>
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-2 mb-1">
              {['Description', 'Qty', 'Unit', 'Weight (kg)', 'Notes', ''].map((h, i) => (
                <span key={i} className={`text-xs font-semibold text-gray-400 uppercase ${
                  i === 0 ? 'col-span-4' : i === 5 ? 'col-span-1' : 'col-span-2'
                }`}>{h}</span>
              ))}
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid sm:grid-cols-12 gap-2 items-start">
                  <input value={item.description} onChange={e => setItem(i, 'description', e.target.value)}
                    className={`${inputCls} sm:col-span-4`} placeholder="Item description" />
                  <input value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)}
                    type="number" min="0" step="any"
                    className={`${inputCls} sm:col-span-2`} placeholder="Qty" />
                  <input value={item.unit} onChange={e => setItem(i, 'unit', e.target.value)}
                    className={`${inputCls} sm:col-span-2`} placeholder="pcs" />
                  <input value={item.weight} onChange={e => setItem(i, 'weight', e.target.value)}
                    type="number" min="0" step="any"
                    className={`${inputCls} sm:col-span-2`} placeholder="kg" />
                  <input value={item.notes} onChange={e => setItem(i, 'notes', e.target.value)}
                    className={`${inputCls} sm:col-span-1`} placeholder="Note" />
                  <button type="button" onClick={() => removeLine(i)} disabled={items.length === 1}
                    className="sm:col-span-1 flex items-center justify-center h-9 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes + Sale ref */}
          <div className="bg-white border border-gray-200 p-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Additional Details</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Special Instructions / Notes</label>
                <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
                  rows={3} className={inputCls} placeholder="Fragile, keep dry, etc." />
              </div>
              <div>
                <label className={labelCls}>Linked Sale ID (optional)</label>
                <input value={form.saleId} onChange={e => setField('saleId', e.target.value)}
                  className={inputCls} placeholder="Sale ID to link this waybill to" />
                <p className="text-xs text-gray-400 mt-1">Paste a sale ID to link this delivery note to a sale record.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Link href="/waybills"
              className="px-5 py-2.5 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Waybill'}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}

export default function NewWaybillPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
      <NewWaybillContent />
    </Suspense>
  )
}
