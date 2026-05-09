'use client'

import { useState } from 'react'
import {
  ALL_ROLES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  type Role,
  type RolePermissionsMap,
} from '@/lib/permissions/rbac'

const ROLE_LABELS: Record<string, string> = {
  OWNER:            'Owner',
  STORE_MANAGER:    'Store Manager',
  CASHIER:          'Cashier',
  INVENTORY_MANAGER:'Inventory Manager',
  ACCOUNTANT:       'Accountant',
  STAFF:            'Staff',
}

interface Props {
  initialOverrides: RolePermissionsMap | null
}

export function RolePermissionsSettings({ initialOverrides }: Props) {
  // Build initial state: use DB override if present, else fall back to code defaults
  const buildInitial = (): Record<Role, Set<string>> => {
    const map = {} as Record<Role, Set<string>>
    for (const role of ALL_ROLES) {
      if (role === 'OWNER') continue
      const override = initialOverrides?.[role]
      map[role] = new Set(
        Array.isArray(override) ? override : [...(PERMISSIONS[role] as readonly string[])]
      )
    }
    return map
  }

  const [perms, setPerms] = useState<Record<Role, Set<string>>>(buildInitial)
  const [activeRole, setActiveRole] = useState<Role>('STORE_MANAGER')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const toggle = (role: Role, perm: string) => {
    setPerms(prev => {
      const next = new Set(prev[role])
      if (next.has(perm)) next.delete(perm); else next.add(perm)
      return { ...prev, [role]: next }
    })
    setSaved(false)
  }

  const resetRole = (role: Role) => {
    setPerms(prev => ({
      ...prev,
      [role]: new Set([...(PERMISSIONS[role] as readonly string[])]),
    }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    const payload: RolePermissionsMap = {}
    for (const role of ALL_ROLES) {
      if (role === 'OWNER') continue
      payload[role] = [...perms[role]]
    }
    try {
      const res = await fetch('/api/settings/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolePermissions: payload }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Save failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const editableRoles = ALL_ROLES.filter(r => r !== 'OWNER')

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-gray-900">Role Permissions</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-semibold text-green-600">✓ Saved</span>}
          {error && <span className="text-sm font-semibold text-red-600">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Owner always has full access and cannot be restricted. Changes take effect on the user's next action.
      </p>

      {/* Role tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
        {editableRoles.map(role => {
          const isActive = activeRole === role
          const count = perms[role]?.size ?? 0
          return (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ROLE_LABELS[role]}
              <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Permission grid for active role */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-800">{ROLE_LABELS[activeRole]}</h3>
        <button
          onClick={() => resetRole(activeRole)}
          className="text-xs text-gray-400 hover:text-gray-700 font-semibold underline"
        >
          Reset to defaults
        </button>
      </div>

      <div className="space-y-5">
        {PERMISSION_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {group.permissions.map(perm => {
                const enabled = perms[activeRole]?.has(perm) ?? false
                return (
                  <label
                    key={perm}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-colors select-none ${
                      enabled
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle(activeRole, perm)}
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <span className="text-xs font-semibold leading-tight">
                      {perm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
