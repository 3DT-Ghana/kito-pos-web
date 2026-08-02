'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { List, Plus, ChevronDown } from 'lucide-react'

interface Account {
  id: string
  code: string
  name: string
  type: string
  normalBalance: string
  isSystemAccount: boolean
  isActive: boolean
  description: string | null
  parent: { id: string; code: string; name: string } | null
  _count: { lines: number }
}

const TYPE_COLORS: Record<string, string> = {
  ASSET:     'bg-blue-100 text-blue-800',
  LIABILITY: 'bg-red-100 text-red-800',
  EQUITY:    'bg-purple-100 text-purple-800',
  REVENUE:   'bg-green-100 text-green-800',
  COGS:      'bg-orange-100 text-orange-800',
  EXPENSE:   'bg-yellow-100 text-yellow-800',
}

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE']

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(TYPE_ORDER.map(t => [t, true]))
  )
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAccount, setNewAccount] = useState({
    code: '', name: '', type: 'ASSET', normalBalance: 'DEBIT', description: '', parentId: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    fetch('/api/accounting/accounts?activeOnly=false')
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(() => setError('Failed to load accounts'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {})

  const handleCreate = async () => {
    if (!newAccount.code || !newAccount.name) {
      setSaveMsg('Code and name are required.')
      return
    }
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveMsg(data.error || 'Failed to create account')
        return
      }
      setAccounts(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)))
      setShowNewForm(false)
      setNewAccount({ code: '', name: '', type: 'ASSET', normalBalance: 'DEBIT', description: '', parentId: '' })
    } catch {
      setSaveMsg('Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">Loading chart of accounts…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3">
              <List className="w-7 h-7 text-blue-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
              <p className="text-sm text-gray-600">{accounts.length} accounts</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow transition-all"
          >
            <Plus className="w-4 h-4" />
            New Account
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* New Account Form */}
        {showNewForm && (
          <div className="bg-white border-2 border-blue-200 p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Create Custom Account</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Account Code *</label>
                <input
                  className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. 7100"
                  value={newAccount.code}
                  onChange={e => setNewAccount(p => ({ ...p, code: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Account Name *</label>
                <input
                  className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. Office Supplies Expense"
                  value={newAccount.name}
                  onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                <select
                  className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  value={newAccount.type}
                  onChange={e => {
                    const t = e.target.value
                    const nb = ['ASSET','COGS','EXPENSE'].includes(t) ? 'DEBIT' : 'CREDIT'
                    setNewAccount(p => ({ ...p, type: t, normalBalance: nb }))
                  }}
                >
                  {TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Normal Balance</label>
                <select
                  className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  value={newAccount.normalBalance}
                  onChange={e => setNewAccount(p => ({ ...p, normalBalance: e.target.value }))}
                >
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <input
                  className="w-full border-2 border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Optional description"
                  value={newAccount.description}
                  onChange={e => setNewAccount(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            {saveMsg && <p className="text-sm text-red-600 mt-2">{saveMsg}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Account'}
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Account groups */}
        {TYPE_ORDER.map(type => {
          const accts = grouped[type]
          if (!accts || accts.length === 0) return null
          const isOpen = expandedTypes[type]

          return (
            <div key={type} className="bg-white border-2 border-gray-200 overflow-hidden shadow-sm">
              <button
                className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                onClick={() => setExpandedTypes(p => ({ ...p, [type]: !p[type] }))}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5  ${TYPE_COLORS[type]}`}>{type}</span>
                  <span className="font-semibold text-gray-800">{accts.length} accounts</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="divide-y divide-gray-100">
                  <div className="grid grid-cols-12 px-5 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50">
                    <span className="col-span-1">Code</span>
                    <span className="col-span-4">Name</span>
                    <span className="col-span-2">Normal Bal.</span>
                    <span className="col-span-3">Parent</span>
                    <span className="col-span-1 text-right">Entries</span>
                    <span className="col-span-1 text-right">System</span>
                  </div>
                  {accts.map(acct => (
                    <div
                      key={acct.id}
                      className={`grid grid-cols-12 px-5 py-3 text-sm items-center ${!acct.isActive ? 'opacity-50' : ''}`}
                    >
                      <span className="col-span-1 font-mono font-bold text-gray-700">{acct.code}</span>
                      <span className="col-span-4 text-gray-900 font-medium">{acct.name}</span>
                      <span className="col-span-2 text-xs text-gray-500">{acct.normalBalance}</span>
                      <span className="col-span-3 text-xs text-gray-500">{acct.parent ? `${acct.parent.code} ${acct.parent.name}` : '—'}</span>
                      <span className="col-span-1 text-right text-gray-600">{acct._count.lines}</span>
                      <span className="col-span-1 text-right">
                        {acct.isSystemAccount && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 ">sys</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </AppLayout>
  )
}
