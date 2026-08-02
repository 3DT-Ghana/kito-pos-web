'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatDate } from '@/lib/utils/format'
import { ClipboardList } from 'lucide-react'

interface AuditEntry {
  id: string
  actorEmail: string
  action: string
  entity: string
  entityId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

const ENTITY_OPTIONS = ['', 'Agent', 'BusinessApplication', 'Tenant']

const ACTION_COLORS: Record<string, string> = {
  APPROVED:   'bg-emerald-100 text-emerald-700',
  REJECTED:   'bg-red-100 text-red-700',
  SUSPENDED:  'bg-orange-100 text-orange-700',
  REINSTATED: 'bg-blue-100 text-blue-700',
  CREATED:    'bg-indigo-100 text-indigo-700',
  UPDATED:    'bg-gray-100 text-gray-700',
}

function actionBadge(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action.toUpperCase().includes(k))
  const cls = key ? ACTION_COLORS[key] : 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 -full ${cls}`}>
      {action}
    </span>
  )
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [entity, setEntity] = useState('')
  const [actor, setActor] = useState('')
  const [actorInput, setActorInput] = useState('')

  const fetchLogs = useCallback(async (reset: boolean, paginationCursor?: string) => {
    if (reset) setLoading(true)
    else setLoadingMore(true)

    const params = new URLSearchParams({ limit: '50' })
    if (entity)            params.set('entity', entity)
    if (actor)             params.set('actor',  actor)
    if (paginationCursor)  params.set('cursor', paginationCursor)

    try {
      const res  = await fetch(`/api/admin/audit-log?${params}`)
      const data = await res.json()
      const items: AuditEntry[] = data.logs ?? []

      setLogs(prev => reset ? items : [...prev, ...items])
      setCursor(data.nextCursor)
      setHasMore(!!data.nextCursor)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [entity, actor])

  useEffect(() => { fetchLogs(true) }, [fetchLogs])

  function handleActorSearch(e: React.FormEvent) {
    e.preventDefault()
    setActor(actorInput.trim())
  }

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Audit Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">All super-admin actions on agents, applications, and tenants</p>
          </div>
          <button
            onClick={() => fetchLogs(true, undefined)}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1">
            {ENTITY_OPTIONS.map(e => (
              <button
                key={e || 'all'}
                onClick={() => setEntity(e)}
                className={`px-4 py-2 text-sm font-semibold border-2 transition-colors ${
                  entity === e
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                }`}
              >
                {e || 'All'}
              </button>
            ))}
          </div>
          <form onSubmit={handleActorSearch} className="relative flex-1 flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Filter by actor email…"
                value={actorInput}
                onChange={e => setActorInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              Search
            </button>
            {actor && (
              <button type="button" onClick={() => { setActor(''); setActorInput('') }}
                className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors">
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="space-y-0 divide-y divide-gray-100">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                  <div className="w-32 h-4 bg-gray-200 " />
                  <div className="w-48 h-4 bg-gray-200 " />
                  <div className="w-24 h-4 bg-gray-200 " />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No audit log entries</p>
              <p className="text-sm text-gray-400 mt-1">Actions performed by super admins will appear here</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Actor</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Action</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase hidden sm:table-cell">Entity</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase hidden md:table-cell">Details</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase hidden sm:table-cell">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900 text-xs font-mono truncate max-w-[160px]">{log.actorEmail}</p>
                      </td>
                      <td className="px-5 py-3">
                        {actionBadge(log.action)}
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <p className="text-gray-700 font-medium">{log.entity}</p>
                        {log.entityId && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[120px]">{log.entityId}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-xs text-gray-500 max-w-xs">
                        {log.details ? (
                          <span className="font-mono text-gray-600 truncate block max-w-[200px]">
                            {Object.entries(log.details)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-xs text-gray-400">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {hasMore && (
                <div className="px-5 py-4 border-t border-gray-100 flex justify-center">
                  <button
                    onClick={() => fetchLogs(false, cursor ?? undefined)}
                    disabled={loadingMore}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && logs.length > 0 && (
          <p className="text-center text-xs text-gray-400">
            Showing {logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}{hasMore ? ' · more available' : ''}
          </p>
        )}

      </div>
    </AdminLayout>
  )
}
