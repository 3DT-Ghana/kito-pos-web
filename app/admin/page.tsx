'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  Building2, Users, Clock, CheckCircle, XCircle, TrendingUp,
  ShieldAlert, ArrowRight, RefreshCw, LogOut, X, MoreHorizontal,
  FileText, LayoutDashboard, BarChart2, ClipboardList,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  totalTenants: number
  byStatus: { TRIAL: number; ACTIVE: number; SUSPENDED: number }
  totalUsers: number
  totalItems: number
  totalSales: number
  totalRevenue: number
}

interface AgentSummary {
  total: number; pending: number; approved: number; suspended: number
}

interface ApplicationSummary {
  total: number; pending: number; approved: number; rejected: number
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

// ─── Badge ─────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  SUSPENDED: 'bg-gray-100 text-gray-600',
  TRIAL:     'bg-amber-100 text-amber-700',
  ACTIVE:    'bg-emerald-100 text-emerald-700',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'applications' | 'agents'

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data: session } = useSession()
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<Tab>('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)

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
        tenantsRes.json(), agentsRes.json(), appsRes.json(),
      ])

      const agents: RecentAgent[] = Array.isArray(agentsData) ? agentsData : []
      const apps: RecentApplication[] = Array.isArray(appsData) ? appsData : []

      setData({
        tenantSummary: tenantsData.summary,
        agentSummary: {
          total:     agents.length,
          pending:   agents.filter(a => a.status === 'PENDING').length,
          approved:  agents.filter(a => a.status === 'APPROVED').length,
          suspended: agents.filter(a => a.status === 'SUSPENDED').length,
        },
        applicationSummary: {
          total:    apps.length,
          pending:  apps.filter(a => a.status === 'PENDING').length,
          approved: apps.filter(a => a.status === 'APPROVED').length,
          rejected: apps.filter(a => a.status === 'REJECTED').length,
        },
        recentApplications: apps
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8),
        recentAgents: agents
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const name = session?.user?.name ?? 'Admin'
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  const pendingAlerts = (data?.agentSummary.pending ?? 0) + (data?.applicationSummary.pending ?? 0)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'applications',  label: 'Applications' },
    { id: 'agents',        label: 'Agents' },
  ]

  return (
    <AdminLayout>
      {/* ── Page shell mirrors tenant dashboard ─────────────────────────── */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 pb-24 md:pb-8">

        {/* ── Dark hero ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-5 sm:px-10 pt-10 pb-28">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-indigo-500/10" />
          <div className="pointer-events-none absolute top-10 -left-16 w-48 h-48 rounded-full bg-violet-500/10" />
          <div className="pointer-events-none absolute bottom-0 right-1/3 w-64 h-64 rounded-full bg-blue-500/8" />

          <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div>
              <p className="text-slate-400 text-sm font-medium">{dateStr}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {greeting}, {name.split(' ')[0]}
              </h1>
              <p className="mt-1 text-indigo-300 text-sm font-medium">PETROS Platform Admin</p>
            </div>

            {/* Hero actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/admin/applications"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium backdrop-blur-sm transition-all"
              >
                <FileText className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Applications</span>
                {pendingAlerts > 0 && (
                  <span className="ml-0.5 bg-amber-400 text-slate-900 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {pendingAlerts}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/companies"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium backdrop-blur-sm transition-all"
              >
                <Building2 className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Companies</span>
              </Link>
              <button
                onClick={load}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium backdrop-blur-sm transition-all"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
                title="Sign out"
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/40 border border-red-400/30 text-white text-sm font-medium backdrop-blur-sm transition-all"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Body pulled up over hero ──────────────────────────────────── */}
        <div className="relative -mt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 font-medium text-sm">
              {error}
            </div>
          )}

          {/* ── KPI row ─────────────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white shadow-sm ring-1 ring-black/5 p-4 h-24 animate-pulse" />
              ))}
            </div>
          ) : data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard icon={<Building2 className="w-5 h-5" />} label="Companies"  value={data.tenantSummary.totalTenants}         color="indigo"  href="/admin/companies" />
              <KpiCard icon={<Clock className="w-5 h-5" />}      label="Trial"      value={data.tenantSummary.byStatus.TRIAL}       color="amber"   href="/admin/companies" />
              <KpiCard icon={<CheckCircle className="w-5 h-5" />} label="Active"   value={data.tenantSummary.byStatus.ACTIVE}      color="emerald" href="/admin/companies" />
              <KpiCard icon={<XCircle className="w-5 h-5" />}    label="Suspended" value={data.tenantSummary.byStatus.SUSPENDED}   color="red"     href="/admin/companies" />
              <KpiCard icon={<Users className="w-5 h-5" />}      label="Users"     value={data.tenantSummary.totalUsers}           color="purple"  href="/admin/companies" />
              <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Revenue"   value={formatCurrency(data.tenantSummary.totalRevenue)} color="green" href="/admin/companies" isText />
            </div>
          )}

          {/* ── Desktop tab bar ──────────────────────────────────────────── */}
          {!loading && data && (
            <>
              <div className="hidden sm:flex gap-1 bg-white shadow-sm ring-1 ring-black/5 p-1.5">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 py-2 px-4 text-sm font-semibold transition-all ${
                      tab === t.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                    {t.id === 'applications' && data.applicationSummary.pending > 0 && (
                      <span className="ml-2 bg-amber-400 text-slate-900 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {data.applicationSummary.pending}
                      </span>
                    )}
                    {t.id === 'agents' && data.agentSummary.pending > 0 && (
                      <span className="ml-2 bg-amber-400 text-slate-900 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {data.agentSummary.pending}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Tab content ─────────────────────────────────────────── */}
              <div className="hidden sm:block">
                {tab === 'overview'     && <OverviewTab data={data} />}
                {tab === 'applications' && <ApplicationsTab apps={data.recentApplications} summary={data.applicationSummary} />}
                {tab === 'agents'       && <AgentsTab agents={data.recentAgents} summary={data.agentSummary} />}
              </div>

              {/* ── Mobile: always show all sections stacked ─────────────── */}
              <div className="sm:hidden space-y-5">
                <OverviewTab data={data} />
                <ApplicationsTab apps={data.recentApplications} summary={data.applicationSummary} />
                <AgentsTab agents={data.recentAgents} summary={data.agentSummary} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile bottom tab bar (admin version) ─────────────────────────── */}
      <AdminBottomNav
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        initials={initials}
        name={name}
        pendingAlerts={pendingAlerts}
      />
    </AdminLayout>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Agents summary */}
      <section className="bg-white shadow-sm ring-1 ring-black/5 p-5">
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
            className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            {data.agentSummary.pending} agent{data.agentSummary.pending !== 1 ? 's' : ''} awaiting approval
          </Link>
        )}
      </section>

      {/* Applications summary */}
      <section className="bg-white shadow-sm ring-1 ring-black/5 p-5">
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
            className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            {data.applicationSummary.pending} application{data.applicationSummary.pending !== 1 ? 's' : ''} awaiting review
          </Link>
        )}
      </section>
    </div>
  )
}

// ─── Applications tab ─────────────────────────────────────────────────────────

function ApplicationsTab({
  apps, summary,
}: {
  apps: RecentApplication[]
  summary: ApplicationSummary
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total"    value={summary.total}    color="text-gray-900" />
        <MiniStat label="Pending"  value={summary.pending}  color="text-amber-700" alert={summary.pending > 0} />
        <MiniStat label="Approved" value={summary.approved} color="text-emerald-700" />
        <MiniStat label="Rejected" value={summary.rejected} color="text-red-600" />
      </div>

      <section className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Recent Applications</h2>
          <Link href="/admin/applications" className="text-xs text-indigo-600 hover:underline">View all</Link>
        </div>
        {apps.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">No applications yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {apps.map(app => (
              <li key={app.id}>
                <Link
                  href={`/admin/applications/${app.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{app.businessName}</p>
                    <p className="text-xs text-gray-400 truncate">{app.ownerFullName} · via {app.agent.fullName}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge status={app.status} />
                      <span className="text-xs text-gray-400">{formatDate(app.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({
  agents, summary,
}: {
  agents: RecentAgent[]
  summary: AgentSummary
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total"     value={summary.total}     color="text-gray-900" />
        <MiniStat label="Pending"   value={summary.pending}   color="text-amber-700" alert={summary.pending > 0} />
        <MiniStat label="Approved"  value={summary.approved}  color="text-emerald-700" />
        <MiniStat label="Suspended" value={summary.suspended} color="text-red-600" />
      </div>

      <section className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Recent Agents</h2>
          <Link href="/admin/agents" className="text-xs text-indigo-600 hover:underline">View all</Link>
        </div>
        {agents.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center">No agents yet</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {agents.map(agent => (
              <li key={agent.id}>
                <Link
                  href={`/admin/agents/${agent.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-slate-100 flex items-center justify-center shrink-0 font-bold text-xs text-slate-600 mt-0.5">
                    {agent.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{agent.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {agent.agentCode}{agent.territory ? ` · ${agent.territory}` : ''} · {agent._count.onboardedBusinesses} businesses
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge status={agent.status} />
                      <span className="text-xs text-gray-400">{formatDate(agent.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Admin mobile bottom nav ──────────────────────────────────────────────────

function AdminBottomNav({
  drawerOpen, setDrawerOpen, initials, name, pendingAlerts,
}: {
  drawerOpen: boolean
  setDrawerOpen: (v: boolean) => void
  initials: string
  name: string
  pendingAlerts: number
}) {
  const tabs = [
    { name: 'Dashboard',    href: '/admin',              Icon: LayoutDashboard },
    { name: 'Applications', href: '/admin/applications', Icon: FileText },
    { name: 'Agents',       href: '/admin/agents',       Icon: Users },
    { name: 'Companies',    href: '/admin/companies',    Icon: Building2 },
  ]

  const moreGroups = [
    {
      label: 'Platform',
      links: [
        { name: 'Reports',   href: '/admin/reports',    Icon: BarChart2 },
        { name: 'Audit Log', href: '/admin/audit-log',  Icon: ClipboardList },
      ],
    },
  ]

  return (
    <>
      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden">
        <div className="flex items-stretch h-16">
          {tabs.map(({ href, name: label, Icon }) => {
            const isApps = href === '/admin/applications'
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 transition-colors relative"
              >
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                  {isApps && pendingAlerts > 0 && (
                    <span className="absolute -top-1 -right-1.5 bg-amber-400 text-slate-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {pendingAlerts > 9 ? '9+' : pendingAlerts}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{label}</span>
              </Link>
            )
          })}

          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-xs font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* More drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl md:hidden max-h-[80vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{name}</p>
                  <p className="text-xs text-indigo-600 font-medium">Platform Admin</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5 pb-8">
              {moreGroups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.links.map(({ name: label, href, Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setDrawerOpen(false)}
                        className="flex flex-col items-center gap-2 py-3 px-2 bg-gray-50 text-gray-600 hover:bg-gray-100 text-center transition-colors"
                      >
                        <Icon className="w-5 h-5" strokeWidth={1.75} />
                        <span className="text-xs font-medium leading-tight">{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {/* Sign out */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/login' })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, color, href, isText,
}: {
  icon: React.ReactNode; label: string; value: number | string
  color: string; href: string; isText?: boolean
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
    <Link href={href} className="bg-white shadow-sm ring-1 ring-black/5 p-4 hover:shadow-md transition-shadow block">
      <div className={`w-8 h-8 ${c.bg} flex items-center justify-center ${c.icon} mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${c.val} ${isText ? 'text-sm' : 'text-2xl'}`}>{value}</p>
    </Link>
  )
}

function MiniStat({
  label, value, color, alert,
}: {
  label: string; value: number; color: string; alert?: boolean
}) {
  return (
    <div className={`px-3 py-2.5 ${alert ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
