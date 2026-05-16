'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { formatDate } from '@/lib/utils/format'

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

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [entity, setEntity] = useState('')
  const [actionType, setActionType] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [entity, actionType, page])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, User> = {}
      ;(data.users || data || []).forEach((u: User) => { map[u.id] = u })
      setUsers(map)
    } catch {}
  }

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (entity) params.set('entity', entity)
      if (actionType) params.set('action', actionType)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) throw new Error('Failed to load audit logs')
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setIsLoading(false)
    }
  }

  const ENTITIES = ['Sale', 'Purchase', 'Item', 'Customer', 'Supplier', 'Payment', 'User', 'Expense', 'StockAdjustment']
  const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'VIEW']

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all actions performed by staff</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Entity</label>
            <select
              value={entity}
              onChange={e => { setEntity(e.target.value); setPage(0) }}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All Entities</option>
              {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Action</label>
            <select
              value={actionType}
              onChange={e => { setActionType(e.target.value); setPage(0) }}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All Actions</option>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Logs list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Activity</h2>
            <span className="text-xs text-gray-400">{logs.length} records</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-gray-500 font-semibold">No activity recorded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map(log => {
                const { type, entity: ent } = actionLabel(log.action)
                const user = users[log.userId]
                return (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                    <span className="text-xl shrink-0">{ENTITY_ICONS[ent] || '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ACTION_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>
                          {type}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">{ent}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {user ? (
                          <><span className="font-medium text-gray-600">{user.name}</span> · {user.role.replace(/_/g, ' ')}</>
                        ) : (
                          <span className="font-mono">{log.userId.slice(0, 8)}…</span>
                        )}
                        {' · '}{formatDate(new Date(log.createdAt))}
                      </p>
                      {log.entityId && (
                        <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                          Record {log.entityId.slice(0, 12)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {(logs.length === PAGE_SIZE || page > 0) && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-1.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400">Page {page + 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={logs.length < PAGE_SIZE}
                className="px-4 py-1.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  )
}
