'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency } from '@/lib/utils/format'
import { Users, Clock, CheckCircle, XCircle, Award } from 'lucide-react'

interface Agent {
  id: string
  agentCode: string
  fullName: string
  phone: string
  email: string
  territory: string | null
  status: string
  approvedAt: string | null
  createdAt: string
  _count: { onboardedBusinesses: number }
}

interface AgentReportRow {
  id: string
  onboardedRevenue: number
  estimatedCommission: number
  approvedApplications: number
  totalApplications: number
  pendingApplications: number
}

type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  SUSPENDED: 'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [reportMap, setReportMap] = useState<Record<string, AgentReportRow>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('ALL')
  const [actionId, setActionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function fetchAgents(status?: string) {
    const url = status && status !== 'ALL' ? `/api/admin/agents?status=${status}` : '/api/admin/agents'
    const res = await fetch(url)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  async function fetchReport() {
    try {
      const res = await fetch('/api/admin/reports')
      if (!res.ok) return {}
      const data = await res.json()
      const map: Record<string, AgentReportRow> = {}
      for (const row of data.agentReport ?? []) {
        map[row.id] = row
      }
      return map
    } catch {
      return {}
    }
  }

  async function load(status?: string) {
    setLoading(true)
    const [agentData, report] = await Promise.all([
      fetchAgents(status ?? filter),
      fetchReport(),
    ])
    setAgents(agentData)
    setReportMap(report)
    setLoading(false)
  }

  useEffect(() => { load(filter) }, [filter])

  async function updateStatus(id: string, status: string) {
    let rejectionReason: string | undefined

    if (status === 'REJECTED') {
      const response = window.prompt('Enter a rejection reason for this agent:')
      if (response === null) return

      rejectionReason = response.trim()
      if (!rejectionReason) {
        setMessage({ type: 'error', text: 'A rejection reason is required to reject an agent.' })
        return
      }
    }

    setActionId(id)
    setMessage(null)

    const res = await fetch(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setActionId(null)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed to update agent' })
      return
    }

    setMessage({
      type: 'success',
      text:
        status === 'APPROVED'
          ? 'Agent approved successfully.'
          : status === 'REJECTED'
            ? 'Agent rejected successfully.'
            : 'Agent suspended successfully.',
    })
    load(filter)
  }

  const filters: FilterStatus[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

  const pendingCount = agents.filter(a => a.status === 'PENDING').length
  const approvedCount = agents.filter(a => a.status === 'APPROVED').length
  const suspendedCount = agents.filter(a => a.status === 'SUSPENDED').length
  const rejectedCount = agents.filter(a => a.status === 'REJECTED').length

  const totalCommission = Object.values(reportMap).reduce((s, r) => s + r.estimatedCommission, 0)

  const filtered = agents.filter(a => {
    const q = search.toLowerCase()
    return !q || a.fullName.toLowerCase().includes(q) || a.agentCode.toLowerCase().includes(q) || (a.territory ?? '').toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
  })

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Sales Agents</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage platform agent accounts and performance</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => load(filter)}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <Link
              href="/admin/agents/new"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold hover:bg-indigo-700 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Register Agent
            </Link>
          </div>
        </div>

        {message && (
          <div className={`text-sm px-4 py-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
            {message.text}
          </div>
        )}

        {/* Scorecard strip */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <ScoreCard icon={<Users className="w-4 h-4" />}        label="Total"     value={agents.length}    color="indigo" />
            <ScoreCard icon={<Clock className="w-4 h-4" />}        label="Pending"   value={pendingCount}     color="amber"   alert={pendingCount > 0} />
            <ScoreCard icon={<CheckCircle className="w-4 h-4" />}  label="Approved"  value={approvedCount}    color="emerald" />
            <ScoreCard icon={<XCircle className="w-4 h-4" />}      label="Suspended" value={suspendedCount}   color="red" />
            <ScoreCard icon={<Award className="w-4 h-4" />}        label="Est. Commissions" value={formatCurrency(totalCommission)} color="purple" isText />
          </div>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1 border-b border-gray-200 flex-1">
            {filters.map(s => (
              <button
                key={s}
                onClick={() => { setLoading(true); setFilter(s) }}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  filter === s
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                {s === 'PENDING' && pendingCount > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search name, code, territory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-56 px-4 py-2 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              <div className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p>Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500">No agents found</p>
              <p className="text-xs text-gray-400 mt-1">{search ? 'Try a different search' : 'No agents match this filter'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-175">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Agent</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Territory</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Onboarded</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Shop Revenue</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Commission</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Joined</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(agent => {
                    const report = reportMap[agent.id]
                    return (
                      <tr key={agent.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div>
                            <Link
                              href={`/admin/agents/${agent.id}`}
                              className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                            >
                              {agent.fullName}
                            </Link>
                            <p className="text-xs text-gray-400">{agent.agentCode} · {agent.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell text-sm text-gray-500">
                          {agent.territory ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 hidden sm:table-cell text-right">
                          <span className="font-bold text-gray-900">{agent._count.onboardedBusinesses}</span>
                          {report && report.totalApplications > report.approvedApplications && (
                            <span className="text-xs text-gray-400"> / {report.totalApplications}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell text-right text-sm font-semibold text-gray-800">
                          {report?.onboardedRevenue ? formatCurrency(report.onboardedRevenue) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell text-right">
                          {report?.estimatedCommission ? (
                            <span className="font-bold text-purple-700">{formatCurrency(report.estimatedCommission)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={agent.status} />
                        </td>
                        <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-gray-400">
                          {new Date(agent.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 justify-end">
                            {agent.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => updateStatus(agent.id, 'APPROVED')}
                                  disabled={actionId === agent.id}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => updateStatus(agent.id, 'REJECTED')}
                                  disabled={actionId === agent.id}
                                  className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 font-semibold transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {agent.status === 'APPROVED' && (
                              <button
                                onClick={() => updateStatus(agent.id, 'SUSPENDED')}
                                disabled={actionId === agent.id}
                                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 disabled:opacity-50 font-semibold transition-colors"
                              >
                                Suspend
                              </button>
                            )}
                            {agent.status === 'SUSPENDED' && (
                              <button
                                onClick={() => updateStatus(agent.id, 'APPROVED')}
                                disabled={actionId === agent.id}
                                className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 font-semibold transition-colors"
                              >
                                Reinstate
                              </button>
                            )}
                            <Link
                              href={`/admin/agents/${agent.id}`}
                              className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 font-semibold transition-colors"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400">
            Showing {filtered.length} of {agents.length} agents
          </p>
        )}
      </div>
    </AdminLayout>
  )
}

function ScoreCard({
  icon, label, value, color, alert, isText,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
  alert?: boolean
  isText?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; val: string; ring: string }> = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700',  ring: '' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700',   ring: 'ring-2 ring-amber-300' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700', ring: '' },
    red:     { bg: 'bg-red-50',     icon: 'text-red-500',     val: 'text-red-600',     ring: '' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700',  ring: '' },
  }
  const c = colors[color] ?? colors.indigo
  return (
    <div className={`bg-white border border-gray-200 shadow-sm p-4 ${alert ? c.ring : ''}`}>
      <div className={`w-8 h-8 ${c.bg} ${c.icon} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${c.val} ${isText ? 'text-sm' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}
