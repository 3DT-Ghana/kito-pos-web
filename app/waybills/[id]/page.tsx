'use client'
import { smartPrint } from '@/lib/print/print'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import {
  ArrowLeft, Printer, Truck, CheckCircle2, XCircle,
  Package, MapPin, Phone, User, Car,
} from 'lucide-react'

type WaybillStatus = 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'

interface WaybillItem {
  id: string; description: string; quantity: number; unit: string; weight: number | null; notes: string | null
}

interface Waybill {
  id: string
  waybillNumber: string
  status: WaybillStatus
  saleId: string | null
  shipperName: string; shipperAddress: string | null; shipperPhone: string | null
  consigneeName: string; consigneeAddress: string; consigneePhone: string | null
  driverName: string | null; vehicleNumber: string | null; carrierName: string | null
  notes: string | null; receivedBy: string | null
  dispatchedAt: string | null; dispatchedById: string | null
  deliveredAt: string | null; deliveredById: string | null
  createdAt: string; createdById: string | null
  items: WaybillItem[]
}

const STATUS_STYLES: Record<WaybillStatus, string> = {
  DRAFT:      'bg-gray-100 text-gray-700',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  CANCELLED:  'bg-red-100 text-red-700',
}

// ── Dispatch modal ─────────────────────────────────────────────────────
function DispatchModal({
  waybill, onClose, onDone
}: { waybill: Waybill; onClose: () => void; onDone: (w: Waybill) => void }) {
  const [driver,  setDriver]  = useState(waybill.driverName ?? '')
  const [vehicle, setVehicle] = useState(waybill.vehicleNumber ?? '')
  const [carrier, setCarrier] = useState(waybill.carrierName ?? '')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/waybills/${waybill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dispatch', driverName: driver, vehicleNumber: vehicle, carrierName: carrier }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed'); return }
      onDone(data)
    } catch { setErr('Something went wrong') }
    finally { setSaving(false) }
  }

  const cls = 'w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Dispatch Waybill</h2>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Driver Name</label>
            <input value={driver} onChange={e => setDriver(e.target.value)} className={cls} placeholder="Driver full name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vehicle / Plate</label>
            <input value={vehicle} onChange={e => setVehicle(e.target.value)} className={cls} placeholder="e.g. GR-1234-24" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Transport Company</label>
            <input value={carrier} onChange={e => setCarrier(e.target.value)} className={cls} placeholder="Carrier name (optional)" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Dispatching…' : 'Dispatch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Deliver modal ──────────────────────────────────────────────────────
function DeliverModal({
  waybill, onClose, onDone
}: { waybill: Waybill; onClose: () => void; onDone: (w: Waybill) => void }) {
  const [receivedBy, setReceivedBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/waybills/${waybill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deliver', receivedBy }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed'); return }
      onDone(data)
    } catch { setErr('Something went wrong') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Confirm Delivery</h2>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Received By (optional)</label>
            <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Name of person who received the goods" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Confirming…' : 'Mark Delivered'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main detail page ───────────────────────────────────────────────────
export default function WaybillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [waybill, setWaybill]     = useState<Waybill | null>(null)
  const [loading, setLoading]     = useState(true)
  const [modal,   setModal]       = useState<'dispatch' | 'deliver' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [loadError, setLoadError]   = useState('')
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/waybills/${id}`)
      if (res.ok) { setWaybill(await res.json()); return }
      // A 403/500 previously fell through to the "Waybill not found" empty
      // state, making a permission error look like a missing record.
      const data = await res.json().catch(() => ({}))
      setLoadError(data.error || (res.status === 404 ? '' : 'Failed to load waybill'))
    } catch {
      setLoadError('Could not reach the server. Check your connection and retry.')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function cancel() {
    if (!waybill) return
    if (!confirm('Cancel this waybill?')) return
    setCancelling(true)
    setActionError('')
    try {
      const res = await fetch(`/api/waybills/${waybill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (res.ok) { setWaybill(await res.json()); return }
      const data = await res.json().catch(() => ({}))
      // Was `if (res.ok)` with no else — a 409 did nothing at all visibly
      setActionError(data.error || 'Could not cancel this waybill')
    } catch {
      setActionError('Could not reach the server. Please try again.')
    } finally { setCancelling(false) }
  }

  async function deleteWaybill() {
    if (!waybill) return
    if (!confirm('Permanently delete this waybill? This cannot be undone.')) return
    setActionError('')
    try {
      const res = await fetch(`/api/waybills/${waybill.id}`, { method: 'DELETE' })
      // The status was never checked, so a rejected delete still navigated
      // away as though it had worked.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete waybill')
      }
      router.push('/waybills')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete waybill')
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4 max-w-4xl mx-auto">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 animate-pulse" />)}
        </div>
      </AppLayout>
    )
  }

  if (!waybill) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className={loadError ? 'text-red-600' : 'text-gray-500'}>
            {loadError || 'Waybill not found.'}
          </p>
          {loadError && (
            <button
              onClick={() => void load()}
              className="mt-3 px-4 py-2 text-sm font-semibold border-2 border-gray-200 hover:bg-gray-50"
            >
              Retry
            </button>
          )}
          <div>
            <Link href="/waybills" className="text-blue-600 text-sm mt-2 inline-block">← Back to waybills</Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  const totalWeight = waybill.items.reduce((s, i) => s + (i.weight ?? 0), 0)

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            ⚠ {actionError}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link href="/waybills" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{waybill.waybillNumber}</h1>
                <span className={`px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[waybill.status]}`}>
                  {waybill.status}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Created {formatDate(waybill.createdAt)}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {waybill.status === 'DRAFT' && (
              <button onClick={() => setModal('dispatch')}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition-colors">
                <Truck className="w-4 h-4" /> Dispatch
              </button>
            )}
            {waybill.status === 'DISPATCHED' && (
              <button onClick={() => setModal('deliver')}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition-colors">
                <CheckCircle2 className="w-4 h-4" /> Mark Delivered
              </button>
            )}
            {(waybill.status === 'DRAFT' || waybill.status === 'DISPATCHED') && (
              <button onClick={cancel} disabled={cancelling}
                className="inline-flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60">
                <XCircle className="w-4 h-4" /> Cancel
              </button>
            )}
            {(waybill.status === 'DRAFT' || waybill.status === 'CANCELLED') && (
              <button onClick={deleteWaybill}
                className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                Delete
              </button>
            )}
            <button onClick={() => smartPrint('report')}
              className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid sm:grid-cols-3 gap-3 print:hidden">
          {[
            { label: 'Items', value: waybill.items.length, icon: Package },
            { label: 'Total Weight', value: totalWeight > 0 ? `${totalWeight} kg` : '—', icon: Truck },
            { label: waybill.dispatchedAt ? 'Dispatched' : 'Status', value: waybill.dispatchedAt ? formatDate(waybill.dispatchedAt) : waybill.status, icon: MapPin },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-bold text-gray-900 text-sm">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
             PRINTABLE WAYBILL DOCUMENT
             ══════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-200 p-8 print:border-0 print:p-6 print:shadow-none" id="waybill-print">

          {/* Document header */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 border-b-2 border-gray-900 pb-5 mb-6">
            <div>
              <div className="text-2xl font-black text-gray-900 tracking-tight">WAYBILL</div>
              <div className="text-xs text-gray-500 mt-1">Delivery Note / Goods Transit Document</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-blue-700">{waybill.waybillNumber}</div>
              <div className="text-xs text-gray-500 mt-0.5">Date: {formatDate(waybill.createdAt)}</div>
              {waybill.saleId && (
                <div className="text-xs text-gray-400 mt-0.5">Ref Sale: {waybill.saleId.slice(0, 8)}…</div>
              )}
              <div className={`mt-1 inline-block px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[waybill.status]}`}>
                {waybill.status}
              </div>
            </div>
          </div>

          {/* Shipper / Consignee */}
          <div className="grid sm:grid-cols-2 gap-6 mb-6">
            <div className="border border-gray-200 p-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Shipper (Sender)</div>
              <p className="font-bold text-gray-900">{waybill.shipperName}</p>
              {waybill.shipperAddress && (
                <div className="flex items-start gap-1.5 mt-1.5 text-sm text-gray-600">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                  <span>{waybill.shipperAddress}</span>
                </div>
              )}
              {waybill.shipperPhone && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span>{waybill.shipperPhone}</span>
                </div>
              )}
            </div>
            <div className="border border-gray-200 p-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Consignee (Recipient)</div>
              <p className="font-bold text-gray-900">{waybill.consigneeName}</p>
              <div className="flex items-start gap-1.5 mt-1.5 text-sm text-gray-600">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                <span>{waybill.consigneeAddress}</span>
              </div>
              {waybill.consigneePhone && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span>{waybill.consigneePhone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Carrier */}
          {(waybill.driverName || waybill.vehicleNumber || waybill.carrierName) && (
            <div className="border border-gray-200 p-4 mb-6">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Carrier / Logistics</div>
              <div className="flex flex-wrap gap-6 text-sm">
                {waybill.driverName && (
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500">Driver:</span>
                    <span className="font-semibold text-gray-900">{waybill.driverName}</span>
                  </div>
                )}
                {waybill.vehicleNumber && (
                  <div className="flex items-center gap-2">
                    <Car className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500">Vehicle:</span>
                    <span className="font-semibold text-gray-900">{waybill.vehicleNumber}</span>
                  </div>
                )}
                {waybill.carrierName && (
                  <div className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500">Company:</span>
                    <span className="font-semibold text-gray-900">{waybill.carrierName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items table */}
          <div className="mb-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Goods Description</div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-3 py-2.5 font-semibold w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Description</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-24">Quantity</th>
                  <th className="text-left px-3 py-2.5 font-semibold w-20">Unit</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-24">Weight (kg)</th>
                  <th className="text-left px-3 py-2.5 font-semibold w-32 print:hidden">Notes</th>
                </tr>
              </thead>
              <tbody>
                {waybill.items.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-900 font-medium">{item.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-gray-500">{item.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {item.weight != null ? item.weight : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs print:hidden">{item.notes ?? '—'}</td>
                  </tr>
                ))}
                {totalWeight > 0 && (
                  <tr className="border-t-2 border-gray-900 bg-gray-50 font-bold">
                    <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total Weight:</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totalWeight} kg</td>
                    <td className="print:hidden" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {waybill.notes && (
            <div className="border border-gray-200 p-4 mb-6">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Special Instructions</div>
              <p className="text-sm text-gray-700">{waybill.notes}</p>
            </div>
          )}

          {/* Timestamps (non-draft) */}
          {(waybill.dispatchedAt || waybill.deliveredAt) && (
            <div className="border border-gray-200 p-4 mb-6">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Timeline</div>
              <div className="flex flex-wrap gap-8 text-sm">
                {waybill.dispatchedAt && (
                  <div>
                    <span className="text-gray-400">Dispatched:</span>{' '}
                    <span className="font-semibold text-gray-900">{formatDateTime(waybill.dispatchedAt)}</span>
                  </div>
                )}
                {waybill.deliveredAt && (
                  <div>
                    <span className="text-gray-400">Delivered:</span>{' '}
                    <span className="font-semibold text-gray-900">{formatDateTime(waybill.deliveredAt)}</span>
                  </div>
                )}
                {waybill.receivedBy && (
                  <div>
                    <span className="text-gray-400">Received by:</span>{' '}
                    <span className="font-semibold text-gray-900">{waybill.receivedBy}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Signature section */}
          <div className="grid grid-cols-2 gap-10 mt-8 pt-4 border-t border-gray-200">
            <div>
              <div className="border-b border-gray-400 h-12 mb-2" />
              <p className="text-xs text-gray-500">Authorised Shipper Signature</p>
              <p className="text-xs text-gray-400 mt-0.5">{waybill.shipperName}</p>
            </div>
            <div>
              <div className="border-b border-gray-400 h-12 mb-2" />
              <p className="text-xs text-gray-500">Consignee / Receiver Signature</p>
              {waybill.receivedBy && <p className="text-xs text-gray-400 mt-0.5">{waybill.receivedBy}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
            This is an official delivery note. Keep for your records. · {waybill.waybillNumber}
          </div>
        </div>
      </div>

      {modal === 'dispatch' && (
        <DispatchModal waybill={waybill} onClose={() => setModal(null)} onDone={w => { setWaybill(w); setModal(null) }} />
      )}
      {modal === 'deliver' && (
        <DeliverModal waybill={waybill} onClose={() => setModal(null)} onDone={w => { setWaybill(w); setModal(null) }} />
      )}

      {/* Print-only styles */}
      <style jsx global>{`
        @media print {
          body > *:not(#__next) { display: none !important; }
          header, nav, aside, footer { display: none !important; }
          .print\\:hidden { display: none !important; }
          #waybill-print { display: block !important; page-break-inside: avoid; }
          @page { margin: 15mm; }
        }
      `}</style>
    </AppLayout>
  )
}
