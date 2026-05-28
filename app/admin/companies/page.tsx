'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Building2, PencilLine, Users, TrendingUp, DollarSign, Wallet } from 'lucide-react'

type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED'
type TenantAdminRole = 'OWNER' | 'STORE_MANAGER'

interface TenantUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

interface TenantRecord {
  id: string
  name: string
  phone: string | null
  status: TenantStatus
  createdAt: string
  agentId: string | null
  userCount: number
  users: TenantUser[]
  itemCount: number
  saleCount: number
  totalRevenue: number
  totalCollected: number
  purchaseCount: number
  totalPurchased: number
  customerCount: number
  supplierCount: number
  features: {
    pos: boolean
    quotations: boolean
    purchaseOrders: boolean
    expiryTracking: boolean
    branches: boolean
    creditSales: boolean
    expenses: boolean
    till: boolean
    sms: boolean
  }
}

interface AgentStub {
  id: string
  agentCode: string
  fullName: string
}

interface Summary {
  totalTenants: number
  byStatus: { TRIAL: number; ACTIVE: number; SUSPENDED: number }
  totalUsers: number
  totalItems: number
  totalSales: number
  totalRevenue: number
}

interface TenantEditForm {
  name: string
  phone: string
}

interface AdminUserForm {
  name: string
  email: string
  role: TenantAdminRole
  password: string
}

const STATUS_STYLES: Record<TenantStatus, string> = {
  TRIAL:     'bg-amber-100 text-amber-800',
  ACTIVE:    'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-red-100 text-red-800',
}

const STATUS_OPTIONS: TenantStatus[] = ['TRIAL', 'ACTIVE', 'SUSPENDED']

const FEATURE_LABELS: Record<string, string> = {
  pos:            'POS Terminal',
  quotations:     'Quotations',
  purchaseOrders: 'Purchase Orders',
  expiryTracking: 'Expiry Tracking',
  branches:       'Branches',
  creditSales:    'Credit Sales',
  expenses:       'Expenses',
  till:           'Till / Cash Register',
  sms:            'SMS Notifications',
}

const ADMIN_ROLE_OPTIONS: TenantAdminRole[] = ['OWNER', 'STORE_MANAGER']

function createEmptyAdminUserForm(): AdminUserForm {
  return {
    name: '',
    email: '',
    role: 'STORE_MANAGER',
    password: '',
  }
}

export default function AdminCompaniesPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [agentMap, setAgentMap] = useState<Record<string, AgentStub>>({})
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [savingTenantId, setSavingTenantId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TenantEditForm>({ name: '', phone: '' })
  const [adminUserEditor, setAdminUserEditor] = useState<{ tenantId: string; userId: string | null } | null>(null)
  const [adminUserForm, setAdminUserForm] = useState<AdminUserForm>(createEmptyAdminUserForm())
  const [savingAdminUserKey, setSavingAdminUserKey] = useState<string | null>(null)
  const [togglingAdminUserId, setTogglingAdminUserId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setIsLoading(true)
    setError(null)
    try {
      const [tenantsRes, agentsRes] = await Promise.all([
        fetch('/api/admin/tenants'),
        fetch('/api/admin/agents'),
      ])
      if (tenantsRes.status === 403) throw new Error('Access denied — super-admin only')
      if (!tenantsRes.ok) throw new Error('Failed to load data')

      const tenantsData = await tenantsRes.json()
      setTenants(tenantsData.tenants)
      setSummary(tenantsData.summary)

      if (agentsRes.ok) {
        const agentsData: AgentStub[] = await agentsRes.json()
        const map: Record<string, AgentStub> = {}
        for (const a of agentsData) map[a.id] = a
        setAgentMap(map)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function updateStatus(tenantId: string, status: TenantStatus) {
    setUpdatingId(tenantId)
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, status }),
      })
      if (!res.ok) throw new Error('Update failed')
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, status } : t))
      if (summary) {
        const old = tenants.find(t => t.id === tenantId)?.status
        if (old && old !== status) {
          setSummary(prev => prev ? {
            ...prev,
            byStatus: {
              ...prev.byStatus,
              [old]: prev.byStatus[old] - 1,
              [status]: prev.byStatus[status] + 1,
            },
          } : prev)
        }
      }
    } finally {
      setUpdatingId(null)
    }
  }

  function startEditingTenant(tenant: TenantRecord) {
    setEditingTenantId(tenant.id)
    setEditForm({
      name: tenant.name,
      phone: tenant.phone ?? '',
    })
    setError(null)
  }

  function cancelEditingTenant() {
    setEditingTenantId(null)
    setSavingTenantId(null)
    setEditForm({ name: '', phone: '' })
  }

  function startAddingAdminUser(tenantId: string) {
    setAdminUserEditor({ tenantId, userId: null })
    setAdminUserForm(createEmptyAdminUserForm())
    setError(null)
  }

  function startEditingAdminUser(tenantId: string, user: TenantUser) {
    setAdminUserEditor({ tenantId, userId: user.id })
    setAdminUserForm({
      name: user.name,
      email: user.email,
      role: user.role === 'OWNER' ? 'OWNER' : 'STORE_MANAGER',
      password: '',
    })
    setError(null)
  }

  function cancelAdminUserEditor() {
    setAdminUserEditor(null)
    setSavingAdminUserKey(null)
    setAdminUserForm(createEmptyAdminUserForm())
  }

  async function saveTenantDetails(tenantId: string) {
    const name = editForm.name.trim()
    const phone = editForm.phone.trim()

    if (!name) {
      setError('Business name is required')
      return
    }

    setSavingTenantId(tenantId)
    setError(null)

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update tenant details')
      }

      setTenants((prev) =>
        prev.map((tenant) =>
          tenant.id === tenantId
            ? {
                ...tenant,
                name: data.name,
                phone: data.phone,
                status: data.status,
              }
            : tenant
        )
      )
      cancelEditingTenant()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tenant details')
    } finally {
      setSavingTenantId(null)
    }
  }

  async function saveAdminUser(tenantId: string) {
    const name = adminUserForm.name.trim()
    const email = adminUserForm.email.trim().toLowerCase()
    const password = adminUserForm.password
    const userId = adminUserEditor?.tenantId === tenantId ? adminUserEditor.userId : null
    const requestKey = `${tenantId}:${userId ?? 'new'}`

    if (!name) {
      setError('Admin user name is required')
      return
    }

    if (!email) {
      setError('Admin user email is required')
      return
    }

    if (!userId && password.length < 8) {
      setError('New admin users must have a password of at least 8 characters')
      return
    }

    if (userId && password && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSavingAdminUserKey(requestKey)
    setError(null)

    try {
      const res = await fetch(
        userId
          ? `/api/admin/tenants/${tenantId}/admin-users/${userId}`
          : `/api/admin/tenants/${tenantId}/admin-users`,
        {
          method: userId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            role: adminUserForm.role,
            ...(password ? { password } : {}),
          }),
        }
      )

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save admin user')
      }

      setTenants((prev) =>
        prev.map((tenant) => {
          if (tenant.id !== tenantId) {
            return tenant
          }

          if (userId) {
            return {
              ...tenant,
              users: tenant.users.map((user) => (user.id === userId ? { ...user, ...data } : user)),
            }
          }

          return {
            ...tenant,
            userCount: tenant.userCount + 1,
            users: [...tenant.users, data],
          }
        })
      )
      setSummary((prev) => prev ? { ...prev, totalUsers: prev.totalUsers + (userId ? 0 : 1) } : prev)

      cancelAdminUserEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save admin user')
    } finally {
      setSavingAdminUserKey(null)
    }
  }

  async function toggleAdminUser(tenantId: string, user: TenantUser) {
    const nextIsActive = !user.isActive

    if (!nextIsActive && !confirm(`Disable "${user.name}"? They will no longer be able to log in.`)) {
      return
    }

    setTogglingAdminUserId(user.id)
    setError(null)

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/admin-users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextIsActive }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update admin user status')
      }

      setTenants((prev) =>
        prev.map((tenant) =>
          tenant.id === tenantId
            ? {
                ...tenant,
                users: tenant.users.map((tenantUser) =>
                  tenantUser.id === user.id ? { ...tenantUser, ...data } : tenantUser
                ),
              }
            : tenant
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update admin user status')
    } finally {
      setTogglingAdminUserId(null)
    }
  }

  const maxRevenue = Math.max(...tenants.map(t => t.totalRevenue), 1)

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || t.name.toLowerCase().includes(q)
      || (t.phone || '').includes(q)
      || t.users.some(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      || (t.agentId && (agentMap[t.agentId]?.fullName ?? '').toLowerCase().includes(q))
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">All Companies</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage onboarded tenants and their account status</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/reports"
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100 transition-colors text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              Revenue Report
            </Link>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 font-medium text-sm">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Companies" value={summary.totalTenants}                icon={<Building2 className="w-5 h-5" />} color="indigo" />
            <SummaryCard label="Active"          value={summary.byStatus.ACTIVE}             icon={<Building2 className="w-5 h-5" />} color="emerald" />
            <SummaryCard label="Total Users"     value={summary.totalUsers}                  icon={<Users className="w-5 h-5" />}    color="purple" />
            <SummaryCard label="Total Revenue"   value={formatCurrency(summary.totalRevenue)} icon={<DollarSign className="w-5 h-5" />} color="green" isText />
          </div>
        )}

        {/* Status + search filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'TRIAL', 'ACTIVE', 'SUSPENDED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 text-sm font-semibold border-2 transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                }`}
              >
                {s === 'all' ? 'All' : s}
                {s !== 'all' && summary && (
                  <span className="ml-1.5 text-xs opacity-70">
                    ({summary.byStatus[s]})
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by company, owner email, phone or agent name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* Tenant list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white border border-gray-200 p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 flex flex-col items-center justify-center py-16">
            <Building2 className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-lg font-semibold text-gray-700">No companies found</p>
            <p className="text-sm text-gray-400 mt-1">{search ? 'Try a different search' : 'No tenants registered yet'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(tenant => {
              const isExpanded = expandedId === tenant.id
              const owner = tenant.users.find(u => u.role === 'OWNER' && u.isActive)
                ?? tenant.users.find(u => u.role === 'OWNER')
              const adminUsers = tenant.users.filter(
                (user) => user.role === 'OWNER' || user.role === 'STORE_MANAGER'
              )
              const isEditingAdminForTenant = adminUserEditor?.tenantId === tenant.id
              const adminUserRequestKey = `${tenant.id}:${isEditingAdminForTenant ? adminUserEditor?.userId ?? 'new' : 'new'}`
              const profit = tenant.totalCollected - tenant.totalPurchased
              const featCount = Object.values(tenant.features).filter(Boolean).length
              const agent = tenant.agentId ? agentMap[tenant.agentId] : null
              const revenuePct = maxRevenue > 0 ? (tenant.totalRevenue / maxRevenue) * 100 : 0

              return (
                <div key={tenant.id} className="bg-white border border-gray-200 shadow-sm overflow-hidden">
                  <div
                    className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedId(null)
                        if (editingTenantId === tenant.id) {
                          cancelEditingTenant()
                        }
                        if (adminUserEditor?.tenantId === tenant.id) {
                          cancelAdminUserEditor()
                        }
                        return
                      }

                      if (editingTenantId && editingTenantId !== tenant.id) {
                        cancelEditingTenant()
                      }
                      if (adminUserEditor?.tenantId && adminUserEditor.tenantId !== tenant.id) {
                        cancelAdminUserEditor()
                      }
                      setExpandedId(tenant.id)
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-11 h-11 bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm">
                          {tenant.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-gray-900 text-base truncate">{tenant.name}</h3>
                            <span className={`px-2 py-0.5 -full text-xs font-bold ${STATUS_STYLES[tenant.status]}`}>
                              {tenant.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {owner?.email || '—'}
                            {tenant.phone && <span className="ml-2 text-gray-400">· {tenant.phone}</span>}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs text-gray-400">Joined {formatDate(tenant.createdAt)}</p>
                            {agent ? (
                              <span className="text-xs text-indigo-600 font-medium">
                                via {agent.fullName} ({agent.agentCode})
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">self-signup</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                        <StatPill label="users"     value={tenant.userCount} />
                        <StatPill label="items"     value={tenant.itemCount} />
                        <StatPill label="sales"     value={tenant.saleCount} />
                        <StatPill label="purchases" value={tenant.purchaseCount} />
                        <StatPill label="customers" value={tenant.customerCount} />
                        <StatPill label="features"  value={featCount} />
                        <div className="text-right hidden sm:block min-w-[80px]">
                          <p className="text-xs text-gray-400">Revenue</p>
                          <p className="text-sm font-bold text-green-700">{formatCurrency(tenant.totalRevenue)}</p>
                          {/* Mini revenue bar */}
                          <div className="mt-1 h-1 -full bg-gray-100 w-20">
                            <div
                              className="h-1 -full bg-green-500 transition-all"
                              style={{ width: `${revenuePct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <svg
                        className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-4 sm:px-5 py-5 space-y-5">

                      <div>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Business Details</h4>
                            <p className="mt-1 text-sm text-gray-500">Edit the stored tenant business profile from the platform side.</p>
                          </div>
                          {editingTenantId === tenant.id ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cancelEditingTenant()
                                }}
                                className="border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void saveTenantDetails(tenant.id)
                                }}
                                disabled={savingTenantId === tenant.id}
                                className="inline-flex items-center gap-2 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <PencilLine className="h-4 w-4" />
                                {savingTenantId === tenant.id ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                startEditingTenant(tenant)
                              }}
                              className="inline-flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              <PencilLine className="h-4 w-4" />
                              Edit Details
                            </button>
                          )}
                        </div>

                        {editingTenantId === tenant.id ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Business name
                              </span>
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                placeholder="Business name"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Phone
                              </span>
                              <input
                                type="text"
                                value={editForm.phone}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                placeholder="Business phone"
                              />
                            </label>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailsCard label="Business Name" value={tenant.name} />
                            <DetailsCard label="Phone" value={tenant.phone || 'Not set'} />
                            <DetailsCard label="Owner Email" value={owner?.email || 'Not set'} />
                            <DetailsCard label="Tenant ID" value={tenant.id} mono />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Admin Users</h4>
                            <p className="mt-1 text-sm text-gray-500">
                              Create, edit, and disable tenant company admin accounts.
                            </p>
                          </div>
                          {isEditingAdminForTenant ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cancelAdminUserEditor()
                                }}
                                className="border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void saveAdminUser(tenant.id)
                                }}
                                disabled={savingAdminUserKey === adminUserRequestKey}
                                className="border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingAdminUserKey === adminUserRequestKey ? 'Saving...' : 'Save Admin User'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                startAddingAdminUser(tenant.id)
                              }}
                              className="inline-flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              <span className="text-base leading-none">+</span>
                              Add Admin User
                            </button>
                          )}
                        </div>

                        {isEditingAdminForTenant && (
                          <div className="mb-3 grid gap-3 border border-gray-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Full name
                              </span>
                              <input
                                type="text"
                                value={adminUserForm.name}
                                onChange={(e) => setAdminUserForm((prev) => ({ ...prev, name: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                placeholder="Admin name"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Email
                              </span>
                              <input
                                type="email"
                                value={adminUserForm.email}
                                onChange={(e) => setAdminUserForm((prev) => ({ ...prev, email: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                placeholder="admin@company.com"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Role
                              </span>
                              <select
                                value={adminUserForm.role}
                                onChange={(e) =>
                                  setAdminUserForm((prev) => ({
                                    ...prev,
                                    role: e.target.value as TenantAdminRole,
                                  }))
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                              >
                                {ADMIN_ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {role === 'OWNER' ? 'Owner' : 'Store Manager'}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                Password
                              </span>
                              <input
                                type="password"
                                value={adminUserForm.password}
                                onChange={(e) => setAdminUserForm((prev) => ({ ...prev, password: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
                                placeholder={adminUserEditor?.userId ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                              />
                            </label>
                          </div>
                        )}

                        {adminUsers.length === 0 ? (
                          <div className="border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
                            No tenant admin users yet. Create an owner or store manager account for this business.
                          </div>
                        ) : (
                          <div className="bg-white border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Joined</th>
                                  <th className="px-4 py-2.5 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {adminUsers.map((user) => (
                                  <tr key={user.id} className={`hover:bg-gray-50 ${!user.isActive ? 'bg-gray-50/60' : ''}`}>
                                    <td className="px-4 py-2.5 font-medium text-gray-900">{user.name}</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{user.email}</td>
                                    <td className="px-4 py-2.5">
                                      <UserRoleBadge role={user.role} />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <UserStatusBadge isActive={user.isActive} />
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            startEditingAdminUser(tenant.id, user)
                                          }}
                                          disabled={togglingAdminUserId === user.id}
                                          className="border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void toggleAdminUser(tenant.id, user)
                                          }}
                                          disabled={togglingAdminUserId === user.id}
                                          className={`px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                            user.isActive
                                              ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                          }`}
                                        >
                                          {togglingAdminUserId === user.id
                                            ? 'Saving...'
                                            : user.isActive
                                              ? 'Disable'
                                              : 'Enable'}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Financial overview */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Financial Overview</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <FinCard label="Total Revenue"   value={formatCurrency(tenant.totalRevenue)}   color="text-gray-900" />
                          <FinCard label="Collected"       value={formatCurrency(tenant.totalCollected)} color="text-emerald-700" />
                          <FinCard label="Total Purchases" value={formatCurrency(tenant.totalPurchased)} color="text-amber-700" />
                          <FinCard label="Est. Profit"     value={formatCurrency(profit)}                color={profit >= 0 ? 'text-blue-700' : 'text-red-600'} />
                        </div>
                      </div>

                      {/* Onboarding agent */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Onboarding</h4>
                        {agent ? (
                          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-2">
                            <div className="w-6 h-6 bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
                              {agent.fullName.charAt(0)}
                            </div>
                            <span className="text-sm font-semibold text-indigo-800">{agent.fullName}</span>
                            <span className="text-xs text-indigo-500">{agent.agentCode}</span>
                            <Link
                              href={`/admin/agents/${tenant.agentId}`}
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-indigo-600 hover:underline ml-1"
                            >
                              View agent →
                            </Link>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Self-signup — no agent</p>
                        )}
                      </div>

                      {/* Enabled features */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Enabled Features</h4>
                        <div className="flex flex-wrap gap-2">
                          {(Object.entries(tenant.features) as [string, boolean][]).map(([key, on]) => (
                            <span key={key} className={`px-2.5 py-1 text-xs font-semibold border ${
                              on
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                            }`}>
                              {FEATURE_LABELS[key] ?? key}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Users */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                          All Users ({tenant.userCount})
                        </h4>
                        <div className="bg-white border border-gray-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                                <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
                                <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                                <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Joined</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {tenant.users.map(u => (
                                <tr key={u.id} className={`hover:bg-gray-50 ${!u.isActive ? 'bg-gray-50/60' : ''}`}>
                                  <td className="px-4 py-2.5 font-medium text-gray-900">{u.name}</td>
                                  <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{u.email}</td>
                                  <td className="px-4 py-2.5">
                                    <UserRoleBadge role={u.role} />
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <UserStatusBadge isActive={u.isActive} />
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-400 text-xs">{formatDate(u.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Billing Plan */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billing Plan</h4>
                        <Link
                          href={`/admin/tenant-plans/${tenant.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                          <Wallet className="w-4 h-4" /> Setup / View Plan
                        </Link>
                      </div>

                      {/* Account status */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Account Status</h4>
                        <div className="flex gap-2 flex-wrap items-center">
                          {STATUS_OPTIONS.map(s => (
                            <button
                              key={s}
                              disabled={tenant.status === s || updatingId === tenant.id}
                              onClick={e => { e.stopPropagation(); updateStatus(tenant.id, s) }}
                              className={`px-4 py-2 text-sm font-bold border-2 transition-colors disabled:cursor-not-allowed ${
                                tenant.status === s
                                  ? s === 'ACTIVE'    ? 'bg-emerald-600 text-white border-emerald-600'
                                  : s === 'SUSPENDED' ? 'bg-red-600 text-white border-red-600'
                                  :                     'bg-amber-500 text-white border-amber-500'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 disabled:opacity-50'
                              }`}
                            >
                              {updatingId === tenant.id ? '…' : s}
                            </button>
                          ))}
                          <p className="text-xs text-gray-400 ml-1">
                            Current: <strong className="text-gray-600">{tenant.status}</strong>
                          </p>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )
            })}

            <p className="text-center text-xs text-gray-400 pt-1">
              Showing {filtered.length} of {tenants.length} companies
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function SummaryCard({ label, value, icon, color, isText }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; isText?: boolean
}) {
  const colorMap: Record<string, { bg: string; icon: string; val: string }> = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700' },
    green:   { bg: 'bg-green-50',   icon: 'text-green-600',   val: 'text-green-700' },
  }
  const c = colorMap[color] ?? colorMap.indigo
  return (
    <div className="bg-white border border-gray-200 shadow-sm p-4">
      <div className={`w-8 h-8 ${c.bg} ${c.icon} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 font-bold ${c.val} ${isText ? 'text-base' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 px-2.5 py-1.5">
      <span className="text-xs font-bold text-gray-700">{value}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}

function FinCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-400 font-semibold">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

function DetailsCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 break-all text-sm font-semibold text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function UserRoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 -full text-xs font-bold ${
      role === 'OWNER' ? 'bg-purple-100 text-purple-800'
      : role === 'STORE_MANAGER' ? 'bg-blue-100 text-blue-800'
      : role === 'BRANCH_MANAGER' ? 'bg-cyan-100 text-cyan-800'
      : role === 'CASHIER' ? 'bg-green-100 text-green-800'
      : role === 'INVENTORY_MANAGER' ? 'bg-amber-100 text-amber-800'
      : role === 'ACCOUNTANT' ? 'bg-pink-100 text-pink-800'
      : 'bg-gray-100 text-gray-700'
    }`}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`px-2 py-0.5 -full text-xs font-bold ${
      isActive
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-gray-200 text-gray-700'
    }`}>
      {isActive ? 'Active' : 'Disabled'}
    </span>
  )
}
