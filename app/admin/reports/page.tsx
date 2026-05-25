'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  TrendingUp, Users, Building2, DollarSign,
  BarChart2, Award, ChevronDown, ChevronUp,
  ArrowUpDown,
} from 'lucide-react'

interface AgentRow {
  id: string
  agentCode: string
  fullName: string
  email: string
  territory: string | null
  status: string
  createdAt: string
  approvedAt: string | null
  totalApplications: number
  approvedApplications: number
  pendingApplications: number
  rejectedApplications: number
  onboardedRevenue: number
  estimatedCommission: number
}

interface ShopRow {
  id: string
  name: string
  phone: string | null
  status: string
  createdAt: string
  agentId: string | null
  agentName: string | null
  agentCode: string | null
  saleCount: number
  revenue: number
  collected: number
  purchaseCount: number
  purchased: number
  profit: number
}

interface Totals {
  totalRevenue: number
  totalCollected: number
  totalPurchased: number
  totalProfit: number
  totalCommissions: number
  totalOnboardedShops: number
  selfSignupShops: number
}

interface ReportData {
  agentReport: AgentRow[]
  shopReport: ShopRow[]
  totals: Totals
}

type AgentSortKey = 'fullName' | 'approvedApplications' | 'onboardedRevenue' | 'estimatedCommission'
type ShopSortKey = 'name' | 'revenue' | 'profit' | 'createdAt'
type SortDir = 'asc' | 'desc'

const STATUS_BADGE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  APPROVED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  SUSPENDED: 'bg-gray-100 text-gray-600',
  TRIAL:     'bg-amber-100 text-amber-700',
  ACTIVE:    'bg-emerald-100 text-emerald-700',
}

function Sb({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 -full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function SortBtn({
  label, sortKey, current, dir, onSort,
}: {
  label: string
  sortKey: string
  current: string
  dir: SortDir
  onSort: (k: string) => void
}) {
  const active = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-semibold text-gray-500 uppercase text-xs tracking-wide hover:text-gray-700 transition-colors"
    >
      {label}
      {active
        ? dir === 'asc'
          ? <ChevronUp className="w-3 h-3 text-indigo-600" />
          : <ChevronDown className="w-3 h-3 text-indigo-600" />
        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  )
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'agents' | 'shops'>('agents')

  const [agentSort, setAgentSort] = useState<AgentSortKey>('onboardedRevenue')
  const [agentDir, setAgentDir] = useState<SortDir>('desc')
  const [agentSearch, setAgentSearch] = useState('')

  const [shopSort, setShopSort] = useState<ShopSortKey>('revenue')
  const [shopDir, setShopDir] = useState<SortDir>('desc')
  const [shopSearch, setShopSearch] = useState('')
  const [shopStatusFilter, setShopStatusFilter] = useState<'all' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED'>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/reports')
      if (!res.ok) throw new Error('Failed to load report data')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  function toggleAgentSort(key: string) {
    const k = key as AgentSortKey
    if (agentSort === k) setAgentDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setAgentSort(k); setAgentDir('desc') }
  }

  function toggleShopSort(key: string) {
    const k = key as ShopSortKey
    if (shopSort === k) setShopDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setShopSort(k); setShopDir('desc') }
  }

  const sortedAgents = data
    ? [...data.agentReport]
        .filter(a => {
          const q = agentSearch.toLowerCase()
          return !q || a.fullName.toLowerCase().includes(q) || a.agentCode.toLowerCase().includes(q) || (a.territory ?? '').toLowerCase().includes(q)
        })
        .sort((a, b) => {
          const mul = agentDir === 'asc' ? 1 : -1
          if (agentSort === 'fullName') return mul * a.fullName.localeCompare(b.fullName)
          return mul * (a[agentSort] - b[agentSort])
        })
    : []

  const sortedShops = data
    ? [...data.shopReport]
        .filter(s => {
          const q = shopSearch.toLowerCase()
          const matchQ = !q || s.name.toLowerCase().includes(q) || (s.agentName ?? '').toLowerCase().includes(q)
          const matchStatus = shopStatusFilter === 'all' || s.status === shopStatusFilter
          return matchQ && matchStatus
        })
        .sort((a, b) => {
          const mul = shopDir === 'asc' ? 1 : -1
          if (shopSort === 'name') return mul * a.name.localeCompare(b.name)
          if (shopSort === 'createdAt') return mul * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          return mul * (a[shopSort] - b[shopSort])
        })
    : []

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Reports</h1>
            <p className="text-sm text-gray-500 mt-0.5">Agent performance, commissions and shop revenue summaries</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 text-sm font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : data && (
          <>
            {/* ── Platform totals ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TotalCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Total Revenue"
                value={formatCurrency(data.totals.totalRevenue)}
                color="indigo"
              />
              <TotalCard
                icon={<DollarSign className="w-5 h-5" />}
                label="Est. Profit"
                value={formatCurrency(data.totals.totalProfit)}
                color={data.totals.totalProfit >= 0 ? 'green' : 'red'}
              />
              <TotalCard
                icon={<Award className="w-5 h-5" />}
                label="Est. Commissions"
                value={formatCurrency(data.totals.totalCommissions)}
                color="purple"
                sub="2% of onboarded shop revenue"
              />
              <TotalCard
                icon={<Building2 className="w-5 h-5" />}
                label="Agent-Onboarded Shops"
                value={String(data.totals.totalOnboardedShops)}
                color="amber"
                sub={`${data.totals.selfSignupShops} self-signup`}
              />
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div className="flex gap-1 border-b border-gray-200">
              {(['agents', 'shops'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    tab === t
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'agents' ? <Users className="w-4 h-4" /> : <BarChart2 className="w-4 h-4" />}
                  {t === 'agents' ? 'Agent Performance' : 'Shop Revenue'}
                  <span className="ml-1 text-xs bg-gray-100 text-gray-600 -full px-1.5 py-0.5 font-bold">
                    {t === 'agents' ? data.agentReport.length : data.shopReport.length}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Agent Performance Tab ─────────────────────────────────────── */}
            {tab === 'agents' && (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Search agents by name, code or territory…"
                  value={agentSearch}
                  onChange={e => setAgentSearch(e.target.value)}
                  className="w-full max-w-sm px-4 py-2.5 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
                />

                <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
                  {sortedAgents.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-gray-400">No agents found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left">
                              <SortBtn label="Agent" sortKey="fullName" current={agentSort} dir={agentDir} onSort={toggleAgentSort} />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Territory</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Onboarded" sortKey="approvedApplications" current={agentSort} dir={agentDir} onSort={toggleAgentSort} />
                            </th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Shop Revenue" sortKey="onboardedRevenue" current={agentSort} dir={agentDir} onSort={toggleAgentSort} />
                            </th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Commission (2%)" sortKey="estimatedCommission" current={agentSort} dir={agentDir} onSort={toggleAgentSort} />
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Applications</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedAgents.map((agent, idx) => (
                            <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <Link
                                      href={`/admin/agents/${agent.id}`}
                                      className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                                    >
                                      {agent.fullName}
                                    </Link>
                                    <p className="text-xs text-gray-400">{agent.agentCode}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{agent.territory ?? '—'}</td>
                              <td className="px-4 py-3"><Sb status={agent.status} /></td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-gray-900">{agent.approvedApplications}</span>
                                <span className="text-xs text-gray-400"> / {agent.totalApplications}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                {agent.onboardedRevenue > 0 ? formatCurrency(agent.onboardedRevenue) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {agent.estimatedCommission > 0 ? (
                                  <span className="font-bold text-purple-700">{formatCurrency(agent.estimatedCommission)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {agent.pendingApplications > 0 && (
                                    <span className="text-xs bg-amber-100 text-amber-700 -full px-1.5 py-0.5 font-bold">
                                      {agent.pendingApplications} pending
                                    </span>
                                  )}
                                  {agent.rejectedApplications > 0 && (
                                    <span className="text-xs bg-red-100 text-red-600 -full px-1.5 py-0.5 font-bold">
                                      {agent.rejectedApplications} rejected
                                    </span>
                                  )}
                                  {agent.pendingApplications === 0 && agent.rejectedApplications === 0 && (
                                    <span className="text-xs text-gray-400">{agent.totalApplications} total</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Commission note */}
                <p className="text-xs text-gray-400 text-center">
                  Commission is estimated at 2% of total revenue from active shops onboarded by each agent. Not yet a payout system.
                </p>
              </div>
            )}

            {/* ── Shop Revenue Tab ──────────────────────────────────────────── */}
            {tab === 'shops' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Search shops by name or agent…"
                    value={shopSearch}
                    onChange={e => setShopSearch(e.target.value)}
                    className="flex-1 max-w-sm px-4 py-2.5 border-2 border-gray-200 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    {(['all', 'TRIAL', 'ACTIVE', 'SUSPENDED'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setShopStatusFilter(s)}
                        className={`px-3 py-2 text-xs font-bold border-2 transition-colors ${
                          shopStatusFilter === s
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        {s === 'all' ? 'All' : s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
                  {sortedShops.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-gray-400">No shops found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[880px]">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left">
                              <SortBtn label="Company" sortKey="name" current={shopSort} dir={shopDir} onSort={toggleShopSort} />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Onboarded by</th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Revenue" sortKey="revenue" current={shopSort} dir={shopDir} onSort={toggleShopSort} />
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Collected</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Purchased</th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Profit" sortKey="profit" current={shopSort} dir={shopDir} onSort={toggleShopSort} />
                            </th>
                            <th className="px-4 py-3 text-right">
                              <SortBtn label="Joined" sortKey="createdAt" current={shopSort} dir={shopDir} onSort={toggleShopSort} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedShops.map(shop => (
                            <tr key={shop.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <Link
                                  href="/admin/companies"
                                  className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                                >
                                  {shop.name}
                                </Link>
                                {shop.phone && <p className="text-xs text-gray-400">{shop.phone}</p>}
                              </td>
                              <td className="px-4 py-3"><Sb status={shop.status} /></td>
                              <td className="px-4 py-3">
                                {shop.agentName ? (
                                  <Link
                                    href={`/admin/agents`}
                                    className="text-xs text-indigo-600 hover:underline font-medium"
                                  >
                                    {shop.agentName}
                                    <span className="text-gray-400 font-normal"> ({shop.agentCode})</span>
                                  </Link>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">Self-signup</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                {shop.revenue > 0 ? formatCurrency(shop.revenue) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-emerald-700 font-medium text-xs">
                                {shop.collected > 0 ? formatCurrency(shop.collected) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-amber-700 font-medium text-xs">
                                {shop.purchased > 0 ? formatCurrency(shop.purchased) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-bold text-sm ${shop.profit >= 0 ? 'text-blue-700' : 'text-red-500'}`}>
                                  {shop.profit !== 0 ? formatCurrency(shop.profit) : <span className="text-gray-300">—</span>}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-gray-400">
                                {formatDate(shop.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400 text-center">
                  Showing {sortedShops.length} of {data.shopReport.length} shops · Revenue from approved sales only
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

function TotalCard({
  icon, label, value, color, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  sub?: string
}) {
  const colors: Record<string, { bg: string; icon: string; val: string }> = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700' },
    green:   { bg: 'bg-green-50',   icon: 'text-green-600',   val: 'text-green-700' },
    red:     { bg: 'bg-red-50',     icon: 'text-red-500',     val: 'text-red-600' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700' },
  }
  const c = colors[color] ?? colors.indigo
  return (
    <div className="bg-white border border-gray-200 shadow-sm p-4">
      <div className={`w-9 h-9 ${c.bg} ${c.icon} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${c.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
