'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { ArrowLeftRight, Plus, X } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'

type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'ACCOUNT'

interface Party {
  id: string
  name: string
  code?: string
}

interface Transfer {
  id: string
  amount: number
  description: string
  date: string
  debitPartyType: PartyType
  debitCustomer:  { id: string; name: string } | null
  debitSupplier:  { id: string; name: string } | null
  debitAccount:   { id: string; name: string; code: string } | null
  creditPartyType: PartyType
  creditCustomer:  { id: string; name: string } | null
  creditSupplier:  { id: string; name: string } | null
  creditAccount:   { id: string; name: string; code: string } | null
  createdAt: string
}

const PARTY_LABELS: Record<PartyType, string> = {
  CUSTOMER: 'Customer',
  SUPPLIER: 'Supplier',
  ACCOUNT:  'Ledger Account',
}

function partyName(t: Transfer, side: 'debit' | 'credit'): string {
  if (side === 'debit') {
    if (t.debitPartyType === 'CUSTOMER' && t.debitCustomer)  return t.debitCustomer.name
    if (t.debitPartyType === 'SUPPLIER' && t.debitSupplier)  return t.debitSupplier.name
    if (t.debitPartyType === 'ACCOUNT'  && t.debitAccount)   return `${t.debitAccount.code} ${t.debitAccount.name}`
  } else {
    if (t.creditPartyType === 'CUSTOMER' && t.creditCustomer) return t.creditCustomer.name
    if (t.creditPartyType === 'SUPPLIER' && t.creditSupplier) return t.creditSupplier.name
    if (t.creditPartyType === 'ACCOUNT'  && t.creditAccount)  return `${t.creditAccount.code} ${t.creditAccount.name}`
  }
  return '—'
}

export default function TransfersPage() {
  const [transfers, setTransfers]     = useState<Transfer[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState('')

  // Reference data
  const [customers, setCustomers]     = useState<Party[]>([])
  const [suppliers, setSuppliers]     = useState<Party[]>([])
  const [accounts, setAccounts]       = useState<Party[]>([])

  // Form state
  const [form, setForm] = useState({
    amount:          '',
    description:     '',
    date:            new Date().toISOString().split('T')[0],
    debitPartyType:  'CUSTOMER' as PartyType,
    debitCustomerId:  '',
    debitSupplierId:  '',
    debitAccountId:   '',
    creditPartyType: 'ACCOUNT' as PartyType,
    creditCustomerId: '',
    creditSupplierId: '',
    creditAccountId:  '',
  })

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/transfers?take=100')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTransfers(data.transfers ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transfers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTransfers()
    // Load reference data
    Promise.all([
      fetch('/api/customers').then(r => r.json()),
      fetch('/api/suppliers').then(r => r.json()),
      fetch('/api/accounting/accounts?activeOnly=true').then(r => r.json()),
    ]).then(([cust, supp, acct]) => {
      setCustomers(Array.isArray(cust) ? cust : (cust.customers ?? cust.data ?? []))
      setSuppliers(Array.isArray(supp) ? supp : (supp.suppliers ?? supp.data ?? []))
      setAccounts(acct.accounts ?? [])
    }).catch(() => {})
  }, [fetchTransfers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        amount:          parseFloat(form.amount),
        description:     form.description,
        date:            form.date,
        debitPartyType:  form.debitPartyType,
        creditPartyType: form.creditPartyType,
      }
      if (form.debitPartyType  === 'CUSTOMER') payload.debitCustomerId  = form.debitCustomerId
      if (form.debitPartyType  === 'SUPPLIER') payload.debitSupplierId  = form.debitSupplierId
      if (form.debitPartyType  === 'ACCOUNT')  payload.debitAccountId   = form.debitAccountId
      if (form.creditPartyType === 'CUSTOMER') payload.creditCustomerId = form.creditCustomerId
      if (form.creditPartyType === 'SUPPLIER') payload.creditSupplierId = form.creditSupplierId
      if (form.creditPartyType === 'ACCOUNT')  payload.creditAccountId  = form.creditAccountId

      const res = await fetch('/api/accounting/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create transfer')

      setShowForm(false)
      setForm({
        amount: '', description: '', date: new Date().toISOString().split('T')[0],
        debitPartyType: 'CUSTOMER', debitCustomerId: '', debitSupplierId: '', debitAccountId: '',
        creditPartyType: 'ACCOUNT', creditCustomerId: '', creditSupplierId: '', creditAccountId: '',
      })
      await fetchTransfers()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create transfer')
    } finally {
      setSubmitting(false)
    }
  }

  const PartySelector = ({
    label, typeKey, idKeys,
  }: {
    label: string
    typeKey: 'debitPartyType' | 'creditPartyType'
    idKeys: { CUSTOMER: 'debitCustomerId' | 'creditCustomerId'; SUPPLIER: 'debitSupplierId' | 'creditSupplierId'; ACCOUNT: 'debitAccountId' | 'creditAccountId' }
  }) => {
    const partyType = form[typeKey]
    const customerId = form[idKeys.CUSTOMER]
    const supplierId = form[idKeys.SUPPLIER]
    const accountId  = form[idKeys.ACCOUNT]

    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">{label}</label>
        <select
          value={partyType}
          onChange={e => setForm(f => ({ ...f, [typeKey]: e.target.value as PartyType, [idKeys.CUSTOMER]: '', [idKeys.SUPPLIER]: '', [idKeys.ACCOUNT]: '' }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {(Object.keys(PARTY_LABELS) as PartyType[]).map(t => (
            <option key={t} value={t}>{PARTY_LABELS[t]}</option>
          ))}
        </select>
        {partyType === 'CUSTOMER' && (
          <select
            value={customerId}
            onChange={e => setForm(f => ({ ...f, [idKeys.CUSTOMER]: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {partyType === 'SUPPLIER' && (
          <select
            value={supplierId}
            onChange={e => setForm(f => ({ ...f, [idKeys.SUPPLIER]: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select supplier…</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {partyType === 'ACCOUNT' && (
          <select
            value={accountId}
            onChange={e => setForm(f => ({ ...f, [idKeys.ACCOUNT]: e.target.value }))}
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select account…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ledger Transfers</h1>
              <p className="text-sm text-gray-500">{total} transfer{total !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(true); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> New Transfer
          </button>
        </div>

        {/* New Transfer Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">New Ledger Transfer</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Reason for transfer…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-red-600 uppercase mb-2">Debit (from)</p>
                  <PartySelector
                    label="Party Type"
                    typeKey="debitPartyType"
                    idKeys={{ CUSTOMER: 'debitCustomerId', SUPPLIER: 'debitSupplierId', ACCOUNT: 'debitAccountId' }}
                  />
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-green-600 uppercase mb-2">Credit (to)</p>
                  <PartySelector
                    label="Party Type"
                    typeKey="creditPartyType"
                    idKeys={{ CUSTOMER: 'creditCustomerId', SUPPLIER: 'creditSupplierId', ACCOUNT: 'creditAccountId' }}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Posting…' : 'Post Transfer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="px-5 py-4 text-red-600 text-sm">{error}</div>
          ) : transfers.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No transfers recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Debit (From)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Credit (To)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transfers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-[220px] truncate" title={t.description}>{t.description}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="text-xs text-red-500 font-semibold">{PARTY_LABELS[t.debitPartyType]}</span>
                          <span className="text-gray-800">{partyName(t, 'debit')}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="text-xs text-green-600 font-semibold">{PARTY_LABELS[t.creditPartyType]}</span>
                          <span className="text-gray-800">{partyName(t, 'credit')}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700 whitespace-nowrap">
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  )
}
