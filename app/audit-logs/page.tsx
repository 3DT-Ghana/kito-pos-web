'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pagination } from '@/components/ui/Pagination'
import { formatDateTime } from '@/lib/utils/format'

interface AuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId?: string | null
  details?: Record<string, unknown> | null
  createdAt: string
}

interface User {
  id: string
  name: string
  role: string
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  VIEW: 'bg-gray-100 text-gray-600',
}

const ENTITY_ICONS: Record<string, string> = {
  Sale: '💰',
  Purchase: '🛒',
  Item: '📦',
  Customer: '👤',
  Supplier: '🚚',
  Payment: '💳',
  User: '👥',
  Expense: '💸',
  StockAdjustment: '🔧',
  Return: '↩️',
}

function actionLabel(action: string): { type: string; entity: string } {
  const parts = action.split('_')
  const type = parts[0]
  const entity = parts.slice(1).join('_')
  return { type, entity }
}

function detailSummary(details?: Record<string, unknown> | null) {
  if (!details) return '—'

  const summary = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')

  return summary || '—'
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)

  // Filters
  const [entity, setEntity] = useState('')
  const [actionType, setActionType] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, User> = {}
      ;(data.users || data || []).forEach((u: User) => { map[u.id] = u })
      setUsers(map)
    } catch {}
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')
      const params = new URLSearchParams()
      if (entity) params.set('entity', entity)
      if (actionType) params.set('action', actionType)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) throw new Error('Failed to load audit logs')
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.pagination?.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
      setLogs([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [actionType, entity, page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const ENTITIES = ['Sale', 'Purchase', 'Item', 'Customer', 'Supplier', 'Payment', 'User', 'Expense', 'StockAdjustment']
  const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'VIEW']
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all actions performed by staff</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 p-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Entity</label>
            <select
              value={entity}
              onChange={e => { setEntity(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All Entities</option>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Action</label>
            <select
              value={actionType}
              onChange={e => { setActionType(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All Actions</option>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Logs table */}
        <div className="bg-white border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Activity</h2>
            <span className="text-xs text-gray-400">{total} records</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-gray-500 font-semibold">No activity recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Time</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Action</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Entity</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Record ID</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => {
                    const { type, entity: ent } = actionLabel(log.action)
                    const user = users[log.userId]
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {user?.name || `${log.userId.slice(0, 8)}…`}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {user?.role?.replace(/_/g, ' ') || 'Unknown role'}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`rounded-full text-xs font-bold px-2 py-0.5 ${ACTION_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>
                            {type}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{ENTITY_ICONS[ent] || '📋'}</span>
                            <span className="font-medium text-gray-800">{ent}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {log.entityId ? log.entityId.slice(0, 18) : '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">
                          <div className="max-w-md truncate" title={detailSummary(log.details)}>
                            {detailSummary(log.details)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && total > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
            />
          )}
        </div>

      </div>
    </AppLayout>
  )
}
