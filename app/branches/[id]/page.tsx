'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatCurrency } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import { useUser } from '@/hooks/useUser'

interface BranchUser {
  id: string
  name: string
  email: string
  role: string
}

interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  isDefault: boolean
  createdAt: string
  users: BranchUser[]
}

interface BranchStats {
  period: string
  sales: { count: number; totalRevenue: number; totalPaid: number }
  purchases: { count: number; totalAmount: number }
  expenses: { count: number; totalAmount: number }
  inventory: { itemCount: number; lowStockCount: number }
  transfers: { outCount: number; inCount: number; pendingCount: number }
}

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

export default function BranchDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { refreshBranches } = useBranch()
  const { isOwner, isLoading: isUserLoading } = useUser()
  const branchId = params.id as string

  const [branch, setBranch] = useState<Branch | null>(null)
  const [stats, setStats] = useState<BranchStats | null>(null)
  const [period, setPeriod] = useState('today')
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (!isUserLoading && !isOwner) {
      router.push('/dashboard')
      return
    }

    if (isOwner) {
      let isActive = true

      const loadBranch = async () => {
        try {
          const res = await fetch(`/api/branches/${branchId}`)
          if (!res.ok) throw new Error()
          const data = await res.json()
          if (!isActive) return
          setBranch(data)
          setFormData({ name: data.name, address: data.address || '', phone: data.phone || '' })
        } finally {
          if (isActive) {
            setIsLoading(false)
          }
        }
      }

      void loadBranch()

      return () => {
        isActive = false
      }
    }
  }, [branchId, isOwner, isUserLoading, router])

  useEffect(() => {
    if (isOwner && branchId) {
      let isActive = true

      const loadStats = async () => {
        const res = await fetch(`/api/branches/${branchId}/stats?period=${period}`)
        if (!res.ok || !isActive) return
        setStats(await res.json())
      }

      void loadStats()

      return () => {
        isActive = false
      }
    }
  }, [branchId, period, isOwner])

  const fetchBranch = async () => {
    try {
      const res = await fetch(`/api/branches/${branchId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setBranch(data)
      setFormData({ name: data.name, address: data.address || '', phone: data.phone || '' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError('')
    setSaveSuccess(false)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/branches/${branchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      setSaveSuccess(true)
      setIsEditing(false)
      await refreshBranches()
      fetchBranch()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setIsSaving(false)
    }
  }

  if (isUserLoading || !isOwner || isLoading) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white h-28 animate-pulse border border-gray-200" />)}
        </div>
      </AppLayout>
    )
  }

  if (!branch) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto text-center py-16">
          <p className="text-gray-500">Branch not found</p>
          <button onClick={() => router.push('/branches')} className="mt-4 text-blue-600 font-semibold text-sm">
            Back to Branches
          </button>
        </div>
      </AppLayout>
    )
  }

  const netProfit = (stats?.sales.totalRevenue ?? 0) - (stats?.purchases.totalAmount ?? 0) - (stats?.expenses.totalAmount ?? 0)

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/branches')} className="p-2 hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{branch.name}</h1>
              {branch.isDefault && (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Default</span>
              )}
            </div>
            {branch.address && <p className="text-sm text-gray-500">{branch.address}</p>}
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm"
            >
              Edit
            </button>
          )}
        </div>

        {/* Edit Form */}
        {isEditing && (
          <form onSubmit={handleSave} className="bg-white border-2 border-blue-200 p-5 space-y-4">
            <h2 className="font-bold text-gray-900">Edit Branch</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(v => ({ ...v, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData(v => ({ ...v, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData(v => ({ ...v, address: e.target.value }))}
                className="w-full px-4 py-2.5 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setIsEditing(false); setSaveError('') }}
                className="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {saveSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm font-medium">
            Branch updated successfully.
          </div>
        )}

        {/* Period Selector */}
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 font-semibold text-sm border-2 transition-colors ${
                period === p.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Revenue</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(stats.sales.totalRevenue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.sales.count} sales</p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Purchases</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{formatCurrency(stats.purchases.totalAmount)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.purchases.count} purchases</p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Expenses</p>
              <p className="text-xl font-bold text-orange-600 mt-1">{formatCurrency(stats.expenses.totalAmount)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.expenses.count} expenses</p>
            </div>
            <div className={`border-2 p-4 ${netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">Net Profit</p>
              <p className={`text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(Math.abs(netProfit))}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{netProfit >= 0 ? 'profit' : 'loss'}</p>
            </div>
          </div>
        )}

        {/* Inventory and transfer summary */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Branch Items</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{stats.inventory.itemCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">in inventory</p>
            </div>
            <div className={`border-2 p-4 ${stats.inventory.lowStockCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">Low Stock</p>
              <p className={`text-xl font-bold mt-1 ${stats.inventory.lowStockCount > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                {stats.inventory.lowStockCount}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">items need restocking</p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Transfers Out</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{stats.transfers.outCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">sent to other branches</p>
            </div>
            <div className="bg-white border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Transfers In</p>
              <p className="text-xl font-bold text-green-600 mt-1">{stats.transfers.inCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">received from other branches</p>
            </div>
            <div className={`border-2 p-4 ${stats.transfers.pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">Pending Transfers</p>
              <p className={`text-xl font-bold mt-1 ${stats.transfers.pendingCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                {stats.transfers.pendingCount}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">awaiting dispatch or receipt</p>
            </div>
          </div>
        )}

        {/* Staff assigned */}
        <div className="bg-white border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Assigned Staff ({branch.users.length})</h2>
          </div>
          {branch.users.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-500">No users assigned to this branch</p>
              <p className="text-xs text-gray-400 mt-1">Assign users from the Users page</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {branch.users.map(u => (
                <div key={u.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-semibold capitalize">
                    {u.role.replace('_', ' ').toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
