'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUser } from '@/hooks/useUser'
import { Pagination } from '@/components/ui/Pagination'

/**
 * Users & Permissions Page
 * Tenant owners and branch managers: manage team accounts, assign granular roles
 */

type RoleKey = 'OWNER' | 'STORE_MANAGER' | 'BRANCH_MANAGER' | 'CASHIER' | 'INVENTORY_MANAGER' | 'ACCOUNTANT' | 'STAFF'

interface User {
  id: string
  name: string
  email: string
  role: RoleKey
  branchId: string | null
  branch?: { id: string; name: string } | null
  createdAt: string
}

interface BranchOption {
  id: string
  name: string
  isDefault: boolean
}

interface UsersPageMeta {
  scope: 'tenant' | 'branch'
  managedBranchId: string | null
  allowedRoles: RoleKey[]
}

const ROLE_INFO: Record<RoleKey, {
  label: string
  shortDesc: string
  color: string
  badgeColor: string
  avatarColor: string
  icon: string
}> = {
  OWNER: {
    label: 'Owner',
    shortDesc: 'Full access to all features',
    color: 'bg-purple-50 border-purple-200',
    badgeColor: 'bg-purple-100 text-purple-800',
    avatarColor: 'from-purple-500 to-purple-700',
    icon: '👑',
  },
  STORE_MANAGER: {
    label: 'Store Manager',
    shortDesc: 'Company-wide operational oversight across branches',
    color: 'bg-indigo-50 border-indigo-200',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    avatarColor: 'from-indigo-500 to-indigo-700',
    icon: '🏪',
  },
  BRANCH_MANAGER: {
    label: 'Branch Manager',
    shortDesc: 'Runs one branch, manages branch staff and transactions',
    color: 'bg-cyan-50 border-cyan-200',
    badgeColor: 'bg-cyan-100 text-cyan-800',
    avatarColor: 'from-cyan-500 to-cyan-700',
    icon: '🏬',
  },
  CASHIER: {
    label: 'Cashier',
    shortDesc: 'Sales & customer payments only',
    color: 'bg-green-50 border-green-200',
    badgeColor: 'bg-green-100 text-green-800',
    avatarColor: 'from-green-500 to-green-700',
    icon: '🧾',
  },
  INVENTORY_MANAGER: {
    label: 'Inventory Manager',
    shortDesc: 'Stock, items & purchases management',
    color: 'bg-amber-50 border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-800',
    avatarColor: 'from-amber-500 to-amber-600',
    icon: '📦',
  },
  ACCOUNTANT: {
    label: 'Accountant',
    shortDesc: 'Reports, payments & balance adjustments',
    color: 'bg-pink-50 border-pink-200',
    badgeColor: 'bg-pink-100 text-pink-800',
    avatarColor: 'from-pink-500 to-pink-700',
    icon: '📊',
  },
  STAFF: {
    label: 'Staff',
    shortDesc: 'Basic sales, purchases & inventory',
    color: 'bg-blue-50 border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-800',
    avatarColor: 'from-blue-500 to-blue-700',
    icon: '👤',
  },
}

// Permission display rows for the matrix
const PERMISSION_ROWS: { label: string; key: string }[] = [
  { key: 'manage_users', label: 'Manage users' },
  { key: 'manage_settings', label: 'System settings' },
  { key: 'view_audit_logs', label: 'View audit logs' },
  { key: 'view_all_reports', label: 'All reports' },
  { key: 'view_profit_margins', label: 'Profit margins' },
  { key: 'void_sales', label: 'Void sales' },
  { key: 'void_purchases', label: 'Void purchases' },
  { key: 'create_sale', label: 'Create sales' },
  { key: 'create_purchase', label: 'Create purchases' },
  { key: 'create_items', label: 'Create items' },
  { key: 'update_items', label: 'Update items' },
  { key: 'delete_items', label: 'Delete items' },
  { key: 'adjust_stock', label: 'Adjust stock' },
  { key: 'manage_manufacturers', label: 'Manufacturers' },
  { key: 'create_customers', label: 'Create customers' },
  { key: 'update_customers', label: 'Update customers' },
  { key: 'delete_customers', label: 'Delete customers' },
  { key: 'create_suppliers', label: 'Create suppliers' },
  { key: 'update_suppliers', label: 'Update suppliers' },
  { key: 'delete_suppliers', label: 'Delete suppliers' },
  { key: 'record_payments', label: 'Record payments' },
  { key: 'adjust_balances', label: 'Adjust balances' },
  { key: 'process_returns', label: 'Process returns' },
  { key: 'view_basic_reports', label: 'Basic reports' },
  { key: 'view_items', label: 'View items' },
  { key: 'view_customers', label: 'View customers' },
  { key: 'view_suppliers', label: 'View suppliers' },
]

const PERMISSIONS_MAP: Record<RoleKey, string[]> = {
  OWNER: PERMISSION_ROWS.map(r => r.key),
  STORE_MANAGER: [
    'view_audit_logs', 'view_all_reports', 'view_profit_margins',
    'void_sales', 'void_purchases', 'record_payments', 'adjust_balances',
    'create_items', 'update_items', 'delete_items', 'adjust_stock', 'manage_manufacturers',
    'create_customers', 'update_customers', 'delete_customers',
    'create_suppliers', 'update_suppliers', 'delete_suppliers',
    'create_sale', 'create_purchase', 'process_returns',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
  BRANCH_MANAGER: [
    'manage_users',
    'view_all_reports', 'view_profit_margins',
    'void_sales', 'void_purchases', 'record_payments', 'adjust_balances',
    'create_items', 'update_items', 'delete_items', 'adjust_stock', 'manage_manufacturers',
    'create_customers', 'update_customers', 'delete_customers',
    'create_suppliers', 'update_suppliers', 'delete_suppliers',
    'create_sale', 'create_purchase', 'process_returns',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
  CASHIER: [
    'create_sale', 'record_payments',
    'create_customers', 'update_customers',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
  INVENTORY_MANAGER: [
    'create_items', 'update_items', 'adjust_stock', 'manage_manufacturers',
    'create_purchase', 'create_suppliers', 'update_suppliers',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
  ACCOUNTANT: [
    'view_audit_logs', 'view_all_reports', 'view_profit_margins',
    'record_payments', 'adjust_balances',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
  STAFF: [
    'create_sale', 'create_purchase', 'record_payments',
    'update_items',
    'create_customers', 'update_customers',
    'create_suppliers', 'update_suppliers',
    'view_basic_reports', 'view_items', 'view_customers', 'view_suppliers',
  ],
}

const RECOMMENDED_ROLES: { role: RoleKey; title: string; when: string; warning?: string }[] = [
  {
    role: 'CASHIER',
    title: 'For front-desk / till staff',
    when: 'Staff who only process sales and accept customer payments.',
    warning: 'Cannot view reports, delete records, or manage inventory.',
  },
  {
    role: 'INVENTORY_MANAGER',
    title: 'For warehouse / stock staff',
    when: 'Staff who receive goods and manage stock levels but should not handle sales cash.',
    warning: 'Cannot see profit margins or financial reports.',
  },
  {
    role: 'ACCOUNTANT',
    title: 'For finance / accounts staff',
    when: 'Staff who reconcile payments, review reports and adjust balances — read-heavy role.',
    warning: 'Cannot create sales or purchases directly.',
  },
  {
    role: 'BRANCH_MANAGER',
    title: 'For branch leaders',
    when: 'Trusted staff responsible for one branch, including branch transfers, reports, and branch team supervision.',
    warning: 'Must be assigned to a branch. This role does not manage company settings or other branches.',
  },
  {
    role: 'STORE_MANAGER',
    title: 'For trusted senior staff',
    when: 'Company-level operations leads who need oversight across all branches without owning company settings.',
  },
  {
    role: 'STAFF',
    title: 'For general staff (legacy)',
    when: 'All-round basic access: sales, purchases and inventory updates. Use more specific roles when possible.',
  },
]

const ALL_ROLES: RoleKey[] = ['OWNER', 'STORE_MANAGER', 'BRANCH_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF']
const BRANCH_MANAGER_ALLOWED_ROLES: RoleKey[] = ['CASHIER', 'INVENTORY_MANAGER', 'STAFF']

function getDefaultRole(allowedRoles: RoleKey[]) {
  return allowedRoles.includes('STAFF') ? 'STAFF' : allowedRoles[0] ?? 'STAFF'
}

type Tab = 'team' | 'matrix' | 'guide'

export default function UsersPage() {
  const router = useRouter()
  const { user: currentUser, isOwner, canManageUsers, isLoading } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [managementMeta, setManagementMeta] = useState<UsersPageMeta | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [tab, setTab] = useState<Tab>('team')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF' as RoleKey,
    branchId: '',
  })

  const availableRoles = managementMeta?.allowedRoles?.length
    ? managementMeta.allowedRoles
    : (isOwner ? ALL_ROLES : BRANCH_MANAGER_ALLOWED_ROLES)
  const isBranchScoped = managementMeta?.scope === 'branch'
  const managedBranch = managementMeta?.managedBranchId
    ? branches.find((branch) => branch.id === managementMeta.managedBranchId) ?? null
    : null

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, branchesRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/branches'),
      ])
      if (!usersRes.ok) throw new Error('Failed')

      const usersData = await usersRes.json()
      const nextUsers = Array.isArray(usersData) ? usersData : (usersData.users || [])
      const nextMeta = Array.isArray(usersData) ? null : (usersData.meta || null)
      const nextAllowedRoles = nextMeta?.allowedRoles?.length
        ? nextMeta.allowedRoles
        : (isOwner ? ALL_ROLES : BRANCH_MANAGER_ALLOWED_ROLES)
      setUsers(nextUsers)
      setManagementMeta(nextMeta)
      setForm((current) => ({
        ...current,
        role: nextAllowedRoles.includes(current.role) ? current.role : getDefaultRole(nextAllowedRoles),
        branchId: nextMeta?.scope === 'branch' ? (nextMeta.managedBranchId || '') : current.branchId,
      }))

      if (branchesRes.ok) {
        const branchData = await branchesRes.json()
        setBranches(branchData.branches || [])
      }
    } catch {
      setError('Failed to load users')
    } finally {
      setLoadingUsers(false)
    }
  }, [isOwner])

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!canManageUsers) {
      router.push('/dashboard')
      return
    }

    fetchUsers()
  }, [canManageUsers, fetchUsers, isLoading, router])

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!availableRoles.includes(form.role)) {
      setError('Select a valid role for your access level')
      return
    }

    if (!isBranchScoped && form.role === 'BRANCH_MANAGER' && !form.branchId) {
      setError('Branch managers must be assigned to a branch')
      return
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to add user'); return }
      setSuccess(`User "${form.name}" added successfully!`)
      setForm({
        name: '',
        email: '',
        password: '',
        role: getDefaultRole(availableRoles),
        branchId: isBranchScoped ? (managementMeta?.managedBranchId || '') : '',
      })
      setShowAddForm(false)
      fetchUsers()
    } catch {
      setError('Failed to add user')
    }
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Remove "${userName}" from your team? They will no longer be able to log in.`)) return
    setDeletingId(userId)
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setSuccess(`User "${userName}" removed successfully.`)
      fetchUsers()
    } catch {
      setError('Failed to remove user')
    } finally {
      setDeletingId(null)
    }
  }

  const handleUpdateUser = async (
    userId: string,
    updates: { role?: RoleKey; branchId?: string | null },
    successMessage: string
  ) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSuccess(successMessage)
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  if (isLoading || !canManageUsers) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Users & Permissions</h1>
            <p className="text-gray-500 mt-1">
              {isBranchScoped
                ? `Manage staff access for ${managedBranch?.name || 'your branch'}`
                : 'Manage team access with granular role-based control'}
            </p>
          </div>
          <button
            onClick={() => { setShowAddForm(true); setError(''); setSuccess('') }}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-md text-sm"
          >
            <span className="text-lg leading-none">+</span>
            Add Team Member
          </button>
        </div>

        {isBranchScoped && managedBranch && (
          <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 px-4 py-3 text-sm">
            Branch manager scope: you can manage users assigned to <span className="font-semibold">{managedBranch.name}</span> only.
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium flex items-center gap-2">
            <span>⚠</span> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm font-medium flex items-center gap-2">
            <span>✓</span> {success}
            <button onClick={() => setSuccess('')} className="ml-auto text-green-400 hover:text-green-600">✕</button>
          </div>
        )}

        {/* Add User Form */}
        {showAddForm && (
          <div className="bg-white border-2 border-blue-100 shadow-lg overflow-hidden">
            <div className="bg-blue-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">Add New Team Member</h2>
              <p className="text-blue-200 text-sm mt-0.5">Fill in the details and assign a role</p>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Ama Serwaa"
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="ama@example.com"
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Role *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as RoleKey })}
                    className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base bg-white"
                  >
                    {availableRoles.map(r => (
                      <option key={r} value={r}>
                        {ROLE_INFO[r].icon} {ROLE_INFO[r].label} — {ROLE_INFO[r].shortDesc}
                      </option>
                    ))}
                  </select>
                  {form.role && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      {ROLE_INFO[form.role].shortDesc}
                    </p>
                  )}
                </div>
                {branches.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Assigned Branch</label>
                    {isBranchScoped ? (
                      <div className="px-4 py-3 border-2 border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-900">
                        {managedBranch?.name || 'Your assigned branch'}
                      </div>
                    ) : (
                      <>
                        <select
                          value={form.branchId}
                          onChange={e => setForm({ ...form, branchId: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base bg-white"
                          required={form.role === 'BRANCH_MANAGER'}
                        >
                          <option value="">
                            {form.role === 'BRANCH_MANAGER' ? 'Select branch for branch manager' : 'No branch restriction'}
                          </option>
                          {branches.map(branch => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}{branch.isDefault ? ' (Main)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1.5 text-xs text-gray-500">
                          Assigned users are locked to that branch across inventory and transaction screens.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors">
                  Add User
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 w-fit">
          {([['team', 'Team Members'], ['matrix', 'Permissions Matrix'], ['guide', 'Role Guide']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB: Team Members */}
        {tab === 'team' && (
          <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Team Members ({users.length})</h2>
            </div>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <span className="text-4xl mb-3">👥</span>
                <p className="font-semibold">No team members yet</p>
                <p className="text-sm mt-1">Add your first staff member above</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((u) => {
                  const info = ROLE_INFO[u.role] ?? ROLE_INFO.STAFF
                  const isCurrentUser = u.id === currentUser?.id
                  return (
                    <div key={u.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Info */}
                      <div className="flex items-center gap-4 flex-1">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-900 text-base">{u.name}</p>
                            {isCurrentUser && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">You</span>
                            )}
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${info.badgeColor}`}>
                              {info.icon} {info.label}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{u.email}</p>
                          {u.branch && (
                            <p className="text-xs text-blue-700 mt-1 font-medium">
                              Branch: {u.branch.name}
                            </p>
                          )}
                          {!u.branchId && branches.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              Branch: Unrestricted
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            Joined {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      {/* Actions */}
                      {!isCurrentUser && (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            onChange={e => {
                              const nextRole = e.target.value as RoleKey
                              if (nextRole === 'BRANCH_MANAGER' && !u.branchId) {
                                setError('Assign a branch first before promoting a user to Branch Manager')
                                return
                              }
                              handleUpdateUser(u.id, { role: nextRole }, 'Role updated successfully')
                            }}
                            className="px-3 py-2 border-2 border-gray-200 text-sm font-medium focus:border-blue-500 focus:outline-none bg-white"
                          >
                            {availableRoles.map(r => (
                              <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                            ))}
                          </select>
                          {branches.length > 0 && !isBranchScoped && (
                            <select
                              value={u.branchId ?? ''}
                              onChange={e =>
                                handleUpdateUser(
                                  u.id,
                                  { branchId: e.target.value || null },
                                  'Branch assignment updated successfully'
                                )
                              }
                              className="px-3 py-2 border-2 border-gray-200 text-sm font-medium focus:border-blue-500 focus:outline-none bg-white"
                            >
                              <option value="">{u.role === 'BRANCH_MANAGER' ? 'Select branch' : 'All / Unrestricted'}</option>
                              {branches.map(branch => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            disabled={deletingId === u.id}
                            className="px-3 py-2 bg-red-50 text-red-600 border-2 border-red-100 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            {deletingId === u.id ? '...' : 'Remove'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {users.length > PAGE_SIZE && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{users.length} total members</span>
                <Pagination page={page} totalPages={Math.ceil(users.length / PAGE_SIZE)} onPageChange={setPage} totalItems={users.length} pageSize={PAGE_SIZE} />
              </div>
            )}
          </div>
        )}

        {/* TAB: Permissions Matrix */}
        {tab === 'matrix' && (
          <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Permissions Matrix</h2>
              <p className="text-sm text-gray-500 mt-0.5">What each role can do across the system</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase min-w-44">Permission</th>
                    {ALL_ROLES.map(r => (
                      <th key={r} className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-base">{ROLE_INFO[r].icon}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${ROLE_INFO[r].badgeColor}`}>
                            {ROLE_INFO[r].label}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PERMISSION_ROWS.map(({ key, label }) => (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium text-xs">{label}</td>
                      {ALL_ROLES.map(r => {
                        const allowed = PERMISSIONS_MAP[r].includes(key)
                        return (
                          <td key={r} className="px-3 py-2.5 text-center">
                            {allowed ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-green-100 rounded-full text-green-700 text-xs font-bold">✓</span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-100 rounded-full text-gray-300 text-xs">–</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: Role Guide (Recommended Roles) */}
        {tab === 'guide' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium flex items-start gap-2">
              <span className="text-lg shrink-0">💡</span>
              <span>
                Assign the <strong>most restrictive role</strong> that still allows the user to do their job.
                This limits the risk of accidental data changes or financial mismanagement.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {RECOMMENDED_ROLES.map(({ role, title, when, warning }) => {
                const info = ROLE_INFO[role]
                return (
                  <div key={role} className={`border p-5 space-y-2 ${info.color}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{info.icon}</span>
                      <div>
                        <h3 className="font-bold text-gray-900">{title}</h3>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${info.badgeColor}`}>
                          {info.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{when}</p>
                    {warning && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-500 bg-white/70 px-3 py-2">
                        <span className="shrink-0">⚠</span>
                        <span>{warning}</span>
                      </div>
                    )}
                    <div className="pt-1">
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Key permissions:</p>
                      <div className="flex flex-wrap gap-1">
                        {PERMISSIONS_MAP[role].slice(0, 6).map(p => (
                          <span key={p} className="text-xs bg-white/80 border border-gray-200 px-2 py-0.5 text-gray-600">
                            {p.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {PERMISSIONS_MAP[role].length > 6 && (
                          <span className="text-xs text-gray-400 px-1 py-0.5">+{PERMISSIONS_MAP[role].length - 6} more</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Mismanagement prevention tips */}
            <div className="bg-white shadow-sm ring-1 ring-black/5 p-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Preventing Mismanagement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: '🚫', title: 'Void & Delete Controls', tip: 'Only Owners, Store Managers and Branch Managers should be trusted with voids, deletes and correction-heavy actions.' },
                  { icon: '💰', title: 'Financial Visibility', tip: 'Profit margins should stay with Owners, Store Managers, Branch Managers and Accountants only. Cashiers do not see margins.' },
                  { icon: '📋', title: 'Separate Roles by Job', tip: 'Give Cashiers the Cashier role, not Staff. More specific roles mean less accidental access to sensitive actions.' },
                  { icon: '👥', title: 'Limit Owner Accounts', tip: 'Keep Owner accounts to a minimum. Use Store Manager for company-wide leads and Branch Manager for location-specific leaders.' },
                ].map(({ icon, title, tip }) => (
                  <div key={title} className="flex gap-3 p-4 bg-gray-50">
                    <span className="text-2xl shrink-0">{icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
