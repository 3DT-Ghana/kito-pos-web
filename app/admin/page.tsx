'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  Building2, Users, Clock, CheckCircle, XCircle,
  TrendingUp, ShieldAlert, ArrowRight,
} from 'lucide-react'

interface Summary {
  totalTenants: number
  byStatus: { TRIAL: number; ACTIVE: number; SUSPENDED: number }
  totalUsers: number
  totalItems: number
  totalSales: number
  totalRevenue: number
}

interface AgentSummary {
  total: number
  pending: number
  approved: number
  suspended: number
}

interface ApplicationSummary {
  total: number
  pending: number
  approved: number
  rejected: number
}

interface RecentApplication {
  id: string
  businessName: string
  ownerFullName: string
  status: string
  createdAt: string
  agent: { fullName: string; agentCode: string }
}

interface RecentAgent {
  id: string
  fullName: string
  agentCode: string
  territory: string | null
  status: string
  createdAt: string
  _count: { onboardedBusinesses: number }
}

interface DashboardData {
  tenantSummary: Summary
  agentSummary: AgentSummary
  applicationSummary: ApplicationSummary
  recentApplications: RecentApplication[]
  recentAgents: RecentAgent[]
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  SUSPENDED: 'bg-gray-100 text-gray-600',
  TRIAL:     'bg-amber-100 text-amber-700',
  ACTIVE:    'bg-emerald-100 text-emerald-700',
}

function badge(status: string) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [tenantsRes, agentsRes, appsRes] = await Promise.all([
        fetch('/api/admin/tenants'),
        fetch('/api/admin/agents'),
        fetch('/api/admin/applications'),
      ])

      if (tenantsRes.status === 403) throw new Error('Access denied — super-admin only')
      if (!tenantsRes.ok || !agentsRes.ok || !appsRes.ok) throw new Error('Failed to load dashboard data')

      const [tenantsData, agentsData, appsData] = await Promise.all([
        tenantsRes.json(),
        agentsRes.json(),
        appsRes.json(),
      ])

      const agents: RecentAgent[] = Array.isArray(agentsData) ? agentsData : []
      const apps: RecentApplication[] = Array.isArray(appsData) ? appsData : []

      const agentSummary: AgentSummary = {
        total:     agents.length,
        pending:   agents.filter(a => a.status === 'PENDING').length,
        approved:  agents.filter(a => a.status === 'APPROVED').length,
        suspended: agents.filter(a => a.status === 'SUSPENDED').length,
      }

      const applicationSummary: ApplicationSummary = {
        total:    apps.length,
        pending:  apps.filter(a => a.status === 'PENDING').length,
        approved: apps.filter(a => a.status === 'APPROVED').length,
        rejected: apps.filter(a => a.status === 'REJECTED').length,
      }

      setData({
        tenantSummary: tenantsData.summary,
        agentSummary,
        applicationSummary,
        recentApplications: apps
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6),
        recentAgents: agents
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-7">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">Real-time health of the PETROS platform</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl font-medium text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : data && (
          <>
            {/* ── Tenant KPIs ─────────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Companies</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard icon={<Building2 className="w-5 h-5" />} label="Total" value={data.tenantSummary.totalTenants} color="indigo" href="/admin/companies" />
                <KpiCard icon={<Clock className="w-5 h-5" />}     label="Trial"     value={data.tenantSummary.byStatus.TRIAL}     color="amber" href="/admin/companies" />
                <KpiCard icon={<CheckCircle className="w-5 h-5" />} label="Active"  value={data.tenantSummary.byStatus.ACTIVE}    color="emerald" href="/admin/companies" />
                <KpiCard icon={<XCircle className="w-5 h-5" />}   label="Suspended" value={data.tenantSummary.byStatus.SUSPENDED} color="red" href="/admin/companies" />
                <KpiCard icon={<Users className="w-5 h-5" />}     label="Users"     value={data.tenantSummary.totalUsers}         color="purple" href="/admin/companies" />
                <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Revenue" value={formatCurrency(data.tenantSummary.totalRevenue)} color="green" isText href="/admin/companies" />
              </div>
            </section>

            {/* ── Agents & Applications ────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Agents */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-800">Sales Agents</h2>
                  <Link href="/admin/agents" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total"     value={data.agentSummary.total}     color="text-gray-900" />
                  <MiniStat label="Pending"   value={data.agentSummary.pending}   color="text-amber-700" alert={data.agentSummary.pending > 0} />
                  <MiniStat label="Approved"  value={data.agentSummary.approved}  color="text-emerald-700" />
                  <MiniStat label="Suspended" value={data.agentSummary.suspended} color="text-red-600" />
                </div>
                {data.agentSummary.pending > 0 && (
                  <Link
                    href="/admin/agents?status=PENDING"
                    className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    {data.agentSummary.pending} agent{data.agentSummary.pending !== 1 ? 's' : ''} awaiting approval
                  </Link>
                )}
              </section>

              {/* Applications */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-800">Business Applications</h2>
                  <Link href="/admin/applications" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total"    value={data.applicationSummary.total}    color="text-gray-900" />
                  <MiniStat label="Pending"  value={data.applicationSummary.pending}  color="text-amber-700" alert={data.applicationSummary.pending > 0} />
                  <MiniStat label="Approved" value={data.applicationSummary.approved} color="text-emerald-700" />
                  <MiniStat label="Rejected" value={data.applicationSummary.rejected} color="text-red-600" />
                </div>
                {data.applicationSummary.pending > 0 && (
                  <Link
                    href="/admin/applications?status=PENDING"
                    className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    {data.applicationSummary.pending} application{data.applicationSummary.pending !== 1 ? 's' : ''} awaiting review
                  </Link>
                )}
              </section>
            </div>

            {/* ── Recent Activity ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Recent Applications */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-800">Recent Applications</h2>
                  <Link href="/admin/applications" className="text-xs text-indigo-600 hover:underline">View all</Link>
                </div>
                {data.recentApplications.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No applications yet</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.recentApplications.map(app => (
                      <li key={app.id}>
                        <Link
                          href={`/admin/applications/${app.id}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{app.businessName}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {app.ownerFullName} · via {app.agent.fullName}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {badge(app.status)}
                            <span className="text-xs text-gray-400">{formatDate(app.createdAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Recent Agents */}
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-800">Recent Agents</h2>
                  <Link href="/admin/agents" className="text-xs text-indigo-600 hover:underline">View all</Link>
                </div>
                {data.recentAgents.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No agents yet</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.recentAgents.map(agent => (
                      <li key={agent.id}>
                        <Link
                          href={`/admin/agents/${agent.id}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 font-bold text-xs text-slate-600">
                            {agent.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{agent.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {agent.agentCode}{agent.territory ? ` · ${agent.territory}` : ''} · {agent._count.onboardedBusinesses} businesses
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {badge(agent.status)}
                            <span className="text-xs text-gray-400">{formatDate(agent.createdAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────────── */

function KpiCard({
  icon, label, value, color, href, isText,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
  href: string
  isText?: boolean
}) {
  const colors: Record<string, { bg: string; icon: string; val: string }> = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700' },
    red:     { bg: 'bg-red-50',     icon: 'text-red-500',     val: 'text-red-600' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700' },
    green:   { bg: 'bg-green-50',   icon: 'text-green-600',   val: 'text-green-700' },
  }
  const c = colors[color]
  return (
    <Link href={href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow block">
      <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center ${c.icon} mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${c.val} ${isText ? 'text-base' : 'text-2xl'}`}>{value}</p>
    </Link>
  )
}

function MiniStat({
  label, value, color, alert,
}: {
  label: string
  value: number
  color: string
  alert?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${alert ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
