'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import { useBranch } from '@/lib/branch/BranchContext'
import {
  TrendingUp, TrendingDown, ShoppingCart, Package,
  Users, AlertTriangle, ArrowUpRight, ArrowDownRight,
  ChevronRight, Wallet, Activity,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  salesLast7Days: { date: string; revenue: number; label: string }[]
  paymentMethodSplit: { method: string; value: number; color: string }[]
  topItems: { name: string; revenue: number; qty: number }[]
  kpis: {
    todayRevenue: number
    todaySalesCount: number
    monthRevenue: number
    monthSalesCount: number
    monthTrend: number | null
    monthExpenses: number
    totalCustomers: number
    stockValue: number
    outstandingDebt: number
    outstandingDebtCount: number
  }
  recentSales: {
    id: string
    customer: string
    total: number
    paid: number
    items: number
    createdAt: string
  }[]
  lowStockItems: { id: string; name: string; quantity: number }[]
}

const EMPTY_DASHBOARD_DATA: DashboardData = {
  salesLast7Days: [],
  paymentMethodSplit: [],
  topItems: [],
  kpis: {
    todayRevenue: 0,
    todaySalesCount: 0,
    monthRevenue: 0,
    monthSalesCount: 0,
    monthTrend: null,
    monthExpenses: 0,
    totalCustomers: 0,
    stockValue: 0,
    outstandingDebt: 0,
    outstandingDebtCount: 0,
  },
  recentSales: [],
  lowStockItems: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readDashboardError(payload: unknown) {
  if (!isRecord(payload)) return null
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  return null
}

function looksLikeHtmlDocument(value: string) {
  const trimmed = value.trimStart().toLowerCase()
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body')
  )
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function normalizeDashboardData(payload: unknown): DashboardData | null {
  if (!isRecord(payload) || !Array.isArray(payload.salesLast7Days) || !Array.isArray(payload.paymentMethodSplit)) {
    return null
  }

  const rawKpis = isRecord(payload.kpis) ? payload.kpis : null
  if (!rawKpis) return null

  return {
    salesLast7Days: payload.salesLast7Days
      .filter(isRecord)
      .map((day) => ({
        date: typeof day.date === 'string' ? day.date : '',
        revenue: typeof day.revenue === 'number' ? day.revenue : 0,
        label: typeof day.label === 'string' ? day.label : '',
      })),
    paymentMethodSplit: payload.paymentMethodSplit
      .filter(isRecord)
      .map((payment) => ({
        method: typeof payment.method === 'string' ? payment.method : 'Unknown',
        value: typeof payment.value === 'number' ? payment.value : 0,
        color: typeof payment.color === 'string' ? payment.color : '#94a3b8',
      })),
    topItems: Array.isArray(payload.topItems)
      ? payload.topItems
          .filter(isRecord)
          .map((item) => ({
            name: typeof item.name === 'string' ? item.name : 'Unnamed item',
            revenue: typeof item.revenue === 'number' ? item.revenue : 0,
            qty: typeof item.qty === 'number' ? item.qty : 0,
          }))
      : [],
    kpis: {
      todayRevenue: typeof rawKpis.todayRevenue === 'number' ? rawKpis.todayRevenue : 0,
      todaySalesCount: typeof rawKpis.todaySalesCount === 'number' ? rawKpis.todaySalesCount : 0,
      monthRevenue: typeof rawKpis.monthRevenue === 'number' ? rawKpis.monthRevenue : 0,
      monthSalesCount: typeof rawKpis.monthSalesCount === 'number' ? rawKpis.monthSalesCount : 0,
      monthTrend: typeof rawKpis.monthTrend === 'number' ? rawKpis.monthTrend : null,
      monthExpenses: typeof rawKpis.monthExpenses === 'number' ? rawKpis.monthExpenses : 0,
      totalCustomers: typeof rawKpis.totalCustomers === 'number' ? rawKpis.totalCustomers : 0,
      stockValue: typeof rawKpis.stockValue === 'number' ? rawKpis.stockValue : 0,
      outstandingDebt: typeof rawKpis.outstandingDebt === 'number' ? rawKpis.outstandingDebt : 0,
      outstandingDebtCount: typeof rawKpis.outstandingDebtCount === 'number' ? rawKpis.outstandingDebtCount : 0,
    },
    recentSales: Array.isArray(payload.recentSales)
      ? payload.recentSales
          .filter(isRecord)
          .map((sale) => ({
            id: typeof sale.id === 'string' ? sale.id : '',
            customer: typeof sale.customer === 'string' ? sale.customer : 'Walk-in',
            total: typeof sale.total === 'number' ? sale.total : 0,
            paid: typeof sale.paid === 'number' ? sale.paid : 0,
            items: typeof sale.items === 'number' ? sale.items : 0,
            createdAt: typeof sale.createdAt === 'string' ? sale.createdAt : new Date(0).toISOString(),
          }))
      : [],
    lowStockItems: Array.isArray(payload.lowStockItems)
      ? payload.lowStockItems
          .filter(isRecord)
          .map((item) => ({
            id: typeof item.id === 'string' ? item.id : '',
            name: typeof item.name === 'string' ? item.name : 'Unnamed item',
            quantity: typeof item.quantity === 'number' ? item.quantity : 0,
          }))
      : [],
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white/60 shadow-sm" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-white shadow-sm" />
        <div className="h-72 rounded-2xl bg-white shadow-sm" />
      </div>
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 text-white rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-base">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  accent: string        // tailwind bg class for icon bg
  iconColor: string     // tailwind text class
  trend?: number | null
  href: string
}

function KpiCard({ label, value, sub, icon: Icon, accent, iconColor, trend, href }: KpiProps) {
  const up = trend != null && trend >= 0

  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.75} />
        </div>
        {trend != null ? (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
            up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {up
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />
            }
            {Math.abs(trend)}%
          </div>
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1.5 font-medium">{label}</p>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{sub}</p>
    </Link>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, sub, href, linkLabel }: {
  title: string; sub: string; href?: string; linkLabel?: string
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors mt-0.5"
        >
          {linkLabel} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DashboardCharts() {
  const { currentBranchId } = useBranch()
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard')
      .then(async (response) => {
        const rawPayload = await response.text()
        const htmlResponse = looksLikeHtmlDocument(rawPayload)
        const payload = !rawPayload || htmlResponse
          ? null
          : safeParseJson(rawPayload)

        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || htmlResponse) {
            throw new Error('Your session has expired. Please sign in again.')
          }

          throw new Error(
            readDashboardError(payload) ?? 'Dashboard data is unavailable right now.'
          )
        }

        if (htmlResponse) {
          throw new Error('Your session has expired. Please sign in again.')
        }

        const normalized = normalizeDashboardData(payload)
        if (!normalized) {
          throw new Error('Dashboard data is unavailable right now.')
        }

        if (!cancelled) {
          setData(normalized)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return

        setData(EMPTY_DASHBOARD_DATA)
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to load dashboard data.'
        )
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentBranchId])

  if (loading) return <Skeleton />
  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Dashboard unavailable</h3>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const { kpis, salesLast7Days, topItems, recentSales, lowStockItems, paymentMethodSplit } = data
  const hasChart = salesLast7Days.some(d => d.revenue > 0)
  const totalPayments = paymentMethodSplit.reduce((s, p) => s + p.value, 0)
  const net = kpis.monthRevenue - kpis.monthExpenses

  return (
    <div className="space-y-5">

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Revenue This Month"
          value={formatCurrency(kpis.monthRevenue)}
          sub={`${kpis.monthSalesCount} sale${kpis.monthSalesCount !== 1 ? 's' : ''} · vs last month`}
          icon={TrendingUp}
          accent="bg-blue-600"
          iconColor="text-white"
          trend={kpis.monthTrend}
          href="/sales"
        />
        <KpiCard
          label="Today's Revenue"
          value={formatCurrency(kpis.todayRevenue)}
          sub={`${kpis.todaySalesCount} transaction${kpis.todaySalesCount !== 1 ? 's' : ''} today`}
          icon={Activity}
          accent="bg-emerald-500"
          iconColor="text-white"
          href="/sales"
        />
        <KpiCard
          label="Outstanding Debt"
          value={formatCurrency(kpis.outstandingDebt)}
          sub={`Across ${kpis.outstandingDebtCount} customer${kpis.outstandingDebtCount !== 1 ? 's' : ''}`}
          icon={AlertTriangle}
          accent="bg-amber-400"
          iconColor="text-white"
          href="/customers"
        />
        <KpiCard
          label="Stock Value"
          value={formatCurrency(kpis.stockValue)}
          sub="Total inventory at cost"
          icon={Package}
          accent="bg-violet-600"
          iconColor="text-white"
          href="/items"
        />
      </div>

      {/* ── Chart + Payment split ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue area chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5">
          <SectionHeader
            title="Revenue — Last 7 Days"
            sub="Daily income from confirmed sales"
            href="/reports"
            linkLabel="Full report"
          />
          {hasChart ? (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={salesLast7Days} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#grad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2.5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 gap-3 text-gray-300">
              <Activity className="w-10 h-10" strokeWidth={1} />
              <p className="text-sm text-gray-400">No sales recorded in the last 7 days</p>
            </div>
          )}
        </div>

        {/* Payment breakdown */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 flex flex-col">
          <SectionHeader title="Payment Methods" sub="Last 7 days" />

          {totalPayments > 0 ? (
            <div className="flex-1 flex flex-col gap-5">
              {/* Segmented bar */}
              <div className="flex rounded-full overflow-hidden h-2.5 gap-0.5">
                {paymentMethodSplit.filter(p => p.value > 0).map((p, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{ width: `${(p.value / totalPayments) * 100}%`, backgroundColor: p.color }}
                  />
                ))}
              </div>

              {/* Rows */}
              <div className="space-y-4 flex-1">
                {paymentMethodSplit.filter(p => p.value > 0).map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">{p.method}</p>
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.value)}</p>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-1 rounded-full"
                          style={{ width: `${(p.value / totalPayments) * 100}%`, backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs text-gray-400">Total collected</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(totalPayments)}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-300">
              <Wallet className="w-9 h-9" strokeWidth={1} />
              <p className="text-sm text-gray-400">No payments recorded</p>
            </div>
          )}
        </div>
      </div>

      {/* ── P&L strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Revenue */}
        <div className="rounded-2xl bg-emerald-600 p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-emerald-200 text-xs font-medium uppercase tracking-wide">Revenue</p>
            <p className="text-white text-2xl font-bold mt-1">{formatCurrency(kpis.monthRevenue)}</p>
            <p className="text-emerald-300 text-xs mt-1">This month</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" strokeWidth={1.75} />
          </div>
        </div>

        {/* Purchases */}
        <div className="rounded-2xl bg-slate-800 p-5 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Purchases</p>
            <p className="text-white text-2xl font-bold mt-1">{formatCurrency(kpis.monthExpenses)}</p>
            <p className="text-slate-400 text-xs mt-1">Stock spend this month</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-slate-300" strokeWidth={1.75} />
          </div>
        </div>

        {/* Net */}
        <div className={`rounded-2xl p-5 flex items-center justify-between shadow-sm ${
          net >= 0 ? 'bg-blue-600' : 'bg-red-600'
        }`}>
          <div>
            <p className={`text-xs font-medium uppercase tracking-wide ${net >= 0 ? 'text-blue-200' : 'text-red-200'}`}>
              Net Margin
            </p>
            <p className="text-white text-2xl font-bold mt-1">{formatCurrency(Math.abs(net))}</p>
            <p className={`text-xs mt-1 ${net >= 0 ? 'text-blue-300' : 'text-red-300'}`}>
              {net >= 0 ? 'Profit this month' : 'Loss this month'}
            </p>
          </div>
          <div className={`w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center`}>
            {net >= 0
              ? <ArrowUpRight className="w-5 h-5 text-white" strokeWidth={1.75} />
              : <ArrowDownRight className="w-5 h-5 text-white" strokeWidth={1.75} />
            }
          </div>
        </div>
      </div>

      {/* ── Recent sales + Sidebar ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <SectionHeader title="Recent Sales" sub="Latest transactions" />
            <Link href="/sales" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors mb-4">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {recentSales.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {recentSales.map((sale, i) => {
                const unpaid = sale.total - sale.paid
                const initials = sale.customer.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']
                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg ${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{sale.customer}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {sale.items} item{sale.items !== 1 ? 's' : ''} ·{' '}
                          {new Date(sale.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(sale.total)}</p>
                      <span className={`inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                        unpaid > 0.01
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {unpaid > 0.01 ? `${formatCurrency(unpaid)} due` : 'Paid'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
              <ShoppingCart className="w-10 h-10" strokeWidth={1} />
              <p className="text-sm text-gray-400">No sales recorded yet</p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">

          {/* Customers + Stock stats */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <Link
              href="/customers"
              className="group bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
                  <Users className="w-4.5 h-4.5 text-slate-500 group-hover:text-blue-600 transition-colors" strokeWidth={1.75} />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpis.totalCustomers.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Total customers</p>
            </Link>
          </div>

          {/* Top selling items */}
          {topItems.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 flex-1">
              <SectionHeader title="Top Items" sub="By revenue — 7 days" />
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false} tickLine={false}
                    width={80}
                    tickFormatter={(v: string) => v.length > 11 ? v.slice(0, 11) + '…' : v}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [formatCurrency(v ?? 0), 'Revenue']}
                    contentStyle={{ borderRadius: 10, fontSize: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Low stock */}
          {lowStockItems.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm font-semibold text-amber-900 flex-1">Low Stock</p>
                <Link href="/items" className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                  Manage
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {lowStockItems.slice(0, 4).map(item => (
                  <Link
                    key={item.id}
                    href={`/items/${item.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm text-gray-700 truncate">{item.name}</p>
                    <span className={`ml-3 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      item.quantity === 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.quantity === 0 ? 'Out' : `${item.quantity}`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
