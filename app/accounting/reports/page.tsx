'use client'

import { useState, useEffect, useCallback } from 'react'
import { smartPrint } from '@/lib/print/print'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  TrendingUp,
  BarChart3,
  Scale,
  BookOpen,
  Users,
  Truck,
  Droplets,
  FileText,
  ShoppingCart,
  Package,
  Receipt,
  Wallet,
  Boxes,
  RefreshCw,
  AlertCircle,
  Calendar,
  Download,
  Printer,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─────────────────────────────────────────────────────────────────────────────
// Export helpers
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportToExcel(rows: Record<string, any>[], filename: string, sheetName = 'Report') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

async function exportToPdf(title: string) {
  const style = document.createElement('style')
  style.id = '__print_style__'
  style.textContent = `
    @media print {
      body > *:not(#__print_root__) { display: none !important; }
      #__print_root__ { display: block !important; }
      @page { margin: 18mm; }
    }
  `
  document.head.appendChild(style)

  const src = document.getElementById('report-panel-content')
  if (!src) { document.head.removeChild(style); smartPrint('report'); return }

  const wrap = document.createElement('div')
  wrap.id = '__print_root__'
  wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;padding:24px;overflow:auto;'

  const heading = document.createElement('h2')
  heading.textContent = title
  heading.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:16px;color:#0f172a;'
  wrap.appendChild(heading)
  wrap.appendChild(src.cloneNode(true))
  document.body.appendChild(wrap)

  await smartPrint('report', wrap)

  document.body.removeChild(wrap)
  document.head.removeChild(style)
}

function ReportBtn({
  onClick,
  loading,
}: {
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Generating…' : 'Generate Report'}
    </button>
  )
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {msg}
    </div>
  )
}

function CashFlowActivitySection({
  title,
  netIncomeLine,
  items,
  net,
}: {
  title: string
  netIncomeLine?: number
  items: { label: string; amount: number }[]
  net: number
}) {
  return (
    <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h4 className="font-semibold text-slate-700 text-sm">{title}</h4>
        <span className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {net >= 0 ? '+' : ''}{fmt(net)}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {netIncomeLine !== undefined && (
          <div className="flex justify-between px-5 py-3 text-sm">
            <span className="text-slate-600 font-medium">Net Income</span>
            <span className={`font-semibold tabular-nums ${netIncomeLine >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
              {fmt(netIncomeLine)}
            </span>
          </div>
        )}
        {items.length === 0 && netIncomeLine === undefined && (
          <p className="px-5 py-4 text-sm text-slate-400 italic">No activity in this period</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex justify-between px-5 py-3 text-sm pl-10">
            <span className="text-slate-500">{item.label}</span>
            <span className={`tabular-nums font-medium ${item.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportSection({
  title,
  rows,
  total,
  indent,
}: {
  title: string
  rows: { code: string; name: string; balance: number }[]
  total: number
  indent?: boolean
}) {
  return (
    <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <h4 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">{title}</h4>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <p className="px-5 py-4 text-sm text-slate-400 italic">No activity in this period</p>
        )}
        {rows.map((r) => (
          <div key={r.code} className={`flex justify-between px-5 py-3 text-sm ${indent ? 'pl-10' : ''}`}>
            <span className="text-slate-600 flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 ">{r.code}</span>
              {r.name}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{fmt(r.balance)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between px-5 py-3.5 bg-slate-800 text-sm font-bold">
        <span className="text-slate-200">Total {title}</span>
        <span className="tabular-nums text-white">{fmt(total)}</span>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  large,
  highlight,
}: {
  label: string
  value: number
  large?: boolean
  highlight?: boolean
}) {
  const positive = value >= 0
  return (
    <div
      className={`flex justify-between items-center px-5 py-4 border-2 ${
        highlight
          ? positive
            ? 'bg-emerald-50 border-emerald-300'
            : 'bg-red-50 border-red-300'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      <span className={`font-bold ${large ? 'text-base text-slate-800' : 'text-sm text-slate-700'}`}>{label}</span>
      <span
        className={`font-bold tabular-nums ${large ? 'text-lg' : 'text-sm'} ${
          highlight ? (positive ? 'text-emerald-700' : 'text-red-600') : 'text-slate-900'
        }`}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Profit & Loss
// ─────────────────────────────────────────────────────────────────────────────

function ProfitLossReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Data = {
    revenue:  { rows: { code: string; name: string; balance: number }[]; total: number }
    cogs:     { rows: { code: string; name: string; balance: number }[]; total: number }
    expenses: { rows: { code: string; name: string; balance: number }[]; total: number }
    summary:  {
      totalRevenue: number
      totalCogs: number
      grossProfit: number
      totalExpenses: number
      netIncome: number
    }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    fetch(`/api/accounting/reports/profit-loss?${p}`)
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d)
        onData([
          ...d.revenue.rows.map(r => ({ Section: 'Revenue', Code: r.code, Account: r.name, Amount: r.balance })),
          { Section: 'Revenue', Code: '', Account: 'Total Revenue', Amount: d.revenue.total },
          ...d.cogs.rows.map(r => ({ Section: 'COGS', Code: r.code, Account: r.name, Amount: r.balance })),
          { Section: 'COGS', Code: '', Account: 'Total COGS', Amount: d.cogs.total },
          { Section: 'Summary', Code: '', Account: 'Gross Profit', Amount: d.summary.grossProfit },
          ...d.expenses.rows.map(r => ({ Section: 'Expenses', Code: r.code, Account: r.name, Amount: r.balance })),
          { Section: 'Expenses', Code: '', Account: 'Total Expenses', Amount: d.expenses.total },
          { Section: 'Summary', Code: '', Account: 'Net Income', Amount: d.summary.netIncome },
        ])
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          <ReportSection title="Revenue"              rows={data.revenue.rows}  total={data.revenue.total} />
          <ReportSection title="Cost of Goods Sold"  rows={data.cogs.rows}     total={data.cogs.total} />
          <SummaryRow label="Gross Profit"    value={data.summary.grossProfit}   highlight />
          <ReportSection title="Operating Expenses"  rows={data.expenses.rows} total={data.expenses.total} />
          <SummaryRow label="Net Income"      value={data.summary.netIncome}     highlight large />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Balance Sheet
// ─────────────────────────────────────────────────────────────────────────────

function BalanceSheetReport({ asOf, onData }: { asOf: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Data = {
    assets:      { rows: { code: string; name: string; balance: number }[]; total: number }
    liabilities: { rows: { code: string; name: string; balance: number }[]; total: number }
    equity:      { rows: { code: string; name: string; balance: number }[]; total: number }
    summary:     {
      totalAssets: number
      totalLiabilities: number
      totalEquity: number
      liabilitiesPlusEquity: number
      balanced: boolean
    }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (asOf) p.set('asOf', asOf)
    fetch(`/api/accounting/reports/balance-sheet?${p}`)
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d)
        onData([
          ...d.assets.rows.map(r => ({ Section: 'Assets', Code: r.code, Account: r.name, Balance: r.balance })),
          { Section: 'Assets', Code: '', Account: 'Total Assets', Balance: d.assets.total },
          ...d.liabilities.rows.map(r => ({ Section: 'Liabilities', Code: r.code, Account: r.name, Balance: r.balance })),
          { Section: 'Liabilities', Code: '', Account: 'Total Liabilities', Balance: d.liabilities.total },
          ...d.equity.rows.map(r => ({ Section: 'Equity', Code: r.code, Account: r.name, Balance: r.balance })),
          { Section: 'Equity', Code: '', Account: 'Total Equity', Balance: d.equity.total },
        ])
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          <ReportSection title="Assets"      rows={data.assets.rows}      total={data.assets.total} />
          <ReportSection title="Liabilities" rows={data.liabilities.rows} total={data.liabilities.total} />
          <ReportSection title="Equity"      rows={data.equity.rows}      total={data.equity.total} />
          <div
            className={`flex justify-between px-5 py-3 border-2 text-sm font-bold ${
              data.summary.balanced
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-red-50 border-red-300 text-red-800'
            }`}
          >
            <span>Liabilities + Equity</span>
            <span className="tabular-nums">
              {fmt(data.summary.liabilitiesPlusEquity)}{' '}
              {data.summary.balanced ? '✓ Balanced' : '✗ Out of balance'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Trial Balance
// ─────────────────────────────────────────────────────────────────────────────

function TrialBalanceReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Data = {
    rows: { code: string; name: string; type: string; totalDebit: number; totalCredit: number; balance: number }[]
    totals: { totalDebit: number; totalCredit: number }
    balanced: boolean
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    fetch(`/api/accounting/reports/trial-balance?${p}`)
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d)
        onData(d.rows.map(r => ({ Code: r.code, Account: r.name, Type: r.type, Debit: r.totalDebit, Credit: r.totalCredit, Balance: r.balance })))
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
            <span className="col-span-1">Code</span>
            <span className="col-span-4">Account</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-2 text-right">Debit</span>
            <span className="col-span-2 text-right">Credit</span>
            <span className="col-span-1 text-right">Balance</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <div key={r.code} className="grid grid-cols-12 px-5 py-2.5 text-sm">
                <span className="col-span-1 font-mono text-gray-400">{r.code}</span>
                <span className="col-span-4 text-gray-800">{r.name}</span>
                <span className="col-span-2 text-xs text-gray-400">{r.type}</span>
                <span className="col-span-2 text-right tabular-nums text-gray-700">
                  {r.totalDebit > 0 ? fmt(r.totalDebit) : '—'}
                </span>
                <span className="col-span-2 text-right tabular-nums text-gray-700">
                  {r.totalCredit > 0 ? fmt(r.totalCredit) : '—'}
                </span>
                <span className="col-span-1 text-right tabular-nums font-medium text-gray-900">
                  {fmt(r.balance)}
                </span>
              </div>
            ))}
          </div>
          <div
            className={`grid grid-cols-12 px-5 py-3 border-t-2 font-bold text-sm ${
              data.balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <span className="col-span-7 text-right text-slate-200">Totals</span>
            <span className="col-span-2 text-right tabular-nums">{fmt(data.totals.totalDebit)}</span>
            <span className="col-span-2 text-right tabular-nums">{fmt(data.totals.totalCredit)}</span>
            <span
              className={`col-span-1 text-right ${
                data.balanced ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {data.balanced ? '✓' : '✗'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. General Ledger
// ─────────────────────────────────────────────────────────────────────────────

function GeneralLedgerReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type: string }[]>([])
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<{
    account: { id: string; code: string; name: string; type: string; normalBalance: string }
    rows: {
      journalEntryId: string
      entryNumber: string
      date: string
      description: string
      source: string
      lineDescription: string | null
      debit: number
      credit: number
      runningBalance: number
    }[]
    totals: { totalDebit: number; totalCredit: number; closingBalance: number }
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/accounting/accounts?activeOnly=true')
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [])

  const load = () => {
    if (!accountId) { setError('Select an account first'); return }
    setLoading(true)
    setError('')
    const p = new URLSearchParams({ accountId })
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    fetch(`/api/accounting/reports/general-ledger?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.rows.map((r: { entryNumber: string; date: string; source: string; lineDescription: string | null; description: string; debit: number; credit: number; runningBalance: number }) => ({
          Entry: r.entryNumber,
          Date: new Date(r.date).toLocaleDateString('en-GH'),
          Source: r.source,
          Description: r.lineDescription ?? r.description,
          Debit: r.debit,
          Credit: r.credit,
          'Running Balance': r.runningBalance,
        })))
      })
      .catch(() => setError('Failed to load general ledger'))
      .finally(() => setLoading(false))
  }

  const sourceColor: Record<string, string> = {
    SALE: 'text-emerald-700 bg-emerald-50',
    PURCHASE: 'text-blue-700 bg-blue-50',
    CUSTOMER_PAYMENT: 'text-teal-700 bg-teal-50',
    SUPPLIER_PAYMENT: 'text-cyan-700 bg-cyan-50',
    EXPENSE: 'text-orange-700 bg-orange-50',
    STOCK_ADJUSTMENT: 'text-purple-700 bg-purple-50',
    MANUAL: 'text-gray-700 bg-gray-100',
    PAYROLL: 'text-rose-700 bg-rose-50',
    TRANSFER: 'text-indigo-700 bg-indigo-50',
    CUSTOMER_RETURN: 'text-amber-700 bg-amber-50',
    SUPPLIER_RETURN: 'text-yellow-700 bg-yellow-50',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select an account…</option>
            {['ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE'].map((type) => {
              const group = accounts.filter((a) => a.type === type)
              if (!group.length) return null
              return (
                <optgroup key={type} label={type}>
                  {group.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </div>
        <ReportBtn onClick={load} loading={loading} />
      </div>
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono text-gray-500">{data.account.code}</span>
            <span className="font-semibold text-gray-900">{data.account.name}</span>
            <span className="text-xs px-2 py-0.5 -full bg-gray-100 text-gray-600">
              {data.account.type}
            </span>
            <span className="text-xs px-2 py-0.5 -full bg-gray-100 text-gray-500">
              Normal: {data.account.normalBalance}
            </span>
          </div>

          <div className="bg-white border border-slate-200 overflow-hidden shadow-sm text-sm">
            <div className="grid grid-cols-12 px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
              <span className="col-span-1">Entry</span>
              <span className="col-span-2">Date</span>
              <span className="col-span-2">Source</span>
              <span className="col-span-3">Description</span>
              <span className="col-span-1 text-right">Debit</span>
              <span className="col-span-1 text-right">Credit</span>
              <span className="col-span-2 text-right">Balance</span>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No transactions in this period.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 px-4 py-2.5 hover:bg-slate-50">
                    <span className="col-span-1 font-mono text-gray-400 text-xs">{r.entryNumber}</span>
                    <span className="col-span-2 text-gray-500">
                      {new Date(r.date).toLocaleDateString('en-GH')}
                    </span>
                    <span className="col-span-2">
                      <span
                        className={`text-xs px-1.5 py-0.5  font-medium ${
                          sourceColor[r.source] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.source.replace('_', ' ')}
                      </span>
                    </span>
                    <span className="col-span-3 text-gray-700 truncate" title={r.lineDescription ?? r.description}>
                      {r.lineDescription ?? r.description}
                    </span>
                    <span className="col-span-1 text-right tabular-nums text-gray-700">
                      {r.debit > 0 ? fmt(r.debit) : '—'}
                    </span>
                    <span className="col-span-1 text-right tabular-nums text-gray-700">
                      {r.credit > 0 ? fmt(r.credit) : '—'}
                    </span>
                    <span
                      className={`col-span-2 text-right tabular-nums font-semibold ${
                        r.runningBalance >= 0 ? 'text-gray-900' : 'text-red-600'
                      }`}
                    >
                      {fmt(r.runningBalance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 px-4 py-3 bg-gray-50 border-t-2 border-gray-200 text-sm font-bold">
              <span className="col-span-8 text-right text-gray-600">Totals</span>
              <span className="col-span-1 text-right tabular-nums">{fmt(data.totals.totalDebit)}</span>
              <span className="col-span-1 text-right tabular-nums">{fmt(data.totals.totalCredit)}</span>
              <span className="col-span-2 text-right tabular-nums text-gray-900">
                {fmt(data.totals.closingBalance)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AR Aging
// ─────────────────────────────────────────────────────────────────────────────

function ArAgingReport({ asOf, onData }: { asOf: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Row = {
    customerId: string
    customerName: string
    phone: string | null
    current: number
    days31_60: number
    days61_90: number
    over90: number
    total: number
    oldestInvoiceDate: string
  }
  type Data = {
    asOf: string
    rows: Row[]
    totals: { current: number; days31_60: number; days61_90: number; over90: number; total: number }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (asOf) p.set('asOf', asOf)
    fetch(`/api/accounting/reports/ar-aging?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        onData(d.rows.map((r: { customerName: string; phone: string | null; current: number; days31_60: number; days61_90: number; over90: number; total: number }) => ({
          Customer: r.customerName, Phone: r.phone ?? '',
          '0-30 Days': r.current, '31-60 Days': r.days31_60,
          '61-90 Days': r.days61_90, '90+ Days': r.over90, Total: r.total,
        })))
      })
      .catch(() => setError('Failed to load AR aging'))
      .finally(() => setLoading(false))
  }

  const agingCols = [
    { key: 'current',   label: '0–30 days',  color: 'text-emerald-700' },
    { key: 'days31_60', label: '31–60 days', color: 'text-amber-600' },
    { key: 'days61_90', label: '61–90 days', color: 'text-orange-600' },
    { key: 'over90',    label: '90+ days',   color: 'text-red-600' },
  ] as const

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            As of {new Date(data.asOf).toLocaleDateString('en-GH')}
          </p>
          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No outstanding receivables.</p>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Customer</th>
                    <th className="text-right px-4 py-2.5 text-emerald-700">0–30 days</th>
                    <th className="text-right px-4 py-2.5 text-amber-600">31–60 days</th>
                    <th className="text-right px-4 py-2.5 text-orange-600">61–90 days</th>
                    <th className="text-right px-4 py-2.5 text-red-600">90+ days</th>
                    <th className="text-right px-4 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={r.customerId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.customerName}</p>
                        {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                      </td>
                      {agingCols.map((col) => (
                        <td key={col.key} className={`px-4 py-2.5 text-right tabular-nums ${col.color}`}>
                          {r[col.key] > 0 ? fmt(r[col.key]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">
                        {fmt(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total</td>
                    {agingCols.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-right tabular-nums ${col.color}`}>
                        {fmt(data.totals[col.key])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {fmt(data.totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AP Aging
// ─────────────────────────────────────────────────────────────────────────────

function ApAgingReport({ asOf, onData }: { asOf: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Row = {
    supplierId: string
    supplierName: string
    phone: string | null
    current: number
    days31_60: number
    days61_90: number
    over90: number
    total: number
  }
  type Data = {
    asOf: string
    rows: Row[]
    totals: { current: number; days31_60: number; days61_90: number; over90: number; total: number }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (asOf) p.set('asOf', asOf)
    fetch(`/api/accounting/reports/ap-aging?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        onData(d.rows.map((r: { supplierName: string; phone: string | null; current: number; days31_60: number; days61_90: number; over90: number; total: number }) => ({
          Supplier: r.supplierName, Phone: r.phone ?? '',
          '0-30 Days': r.current, '31-60 Days': r.days31_60,
          '61-90 Days': r.days61_90, '90+ Days': r.over90, Total: r.total,
        })))
      })
      .catch(() => setError('Failed to load AP aging'))
      .finally(() => setLoading(false))
  }

  const agingCols = [
    { key: 'current',   label: '0–30 days',  color: 'text-emerald-700' },
    { key: 'days31_60', label: '31–60 days', color: 'text-amber-600' },
    { key: 'days61_90', label: '61–90 days', color: 'text-orange-600' },
    { key: 'over90',    label: '90+ days',   color: 'text-red-600' },
  ] as const

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            As of {new Date(data.asOf).toLocaleDateString('en-GH')}
          </p>
          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No outstanding payables.</p>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Supplier</th>
                    <th className="text-right px-4 py-2.5 text-emerald-700">0–30 days</th>
                    <th className="text-right px-4 py-2.5 text-amber-600">31–60 days</th>
                    <th className="text-right px-4 py-2.5 text-orange-600">61–90 days</th>
                    <th className="text-right px-4 py-2.5 text-red-600">90+ days</th>
                    <th className="text-right px-4 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={r.supplierId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.supplierName}</p>
                        {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                      </td>
                      {agingCols.map((col) => (
                        <td key={col.key} className={`px-4 py-2.5 text-right tabular-nums ${col.color}`}>
                          {r[col.key] > 0 ? fmt(r[col.key]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">
                        {fmt(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total</td>
                    {agingCols.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-right tabular-nums ${col.color}`}>
                        {fmt(data.totals[col.key])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {fmt(data.totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cash Flow Statement
// ─────────────────────────────────────────────────────────────────────────────

function CashFlowReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Data = {
    operating: {
      netIncome: number
      workingCapitalAdjustments: { label: string; amount: number }[]
      totalWorkingCapital: number
      netCashFromOperations: number
    }
    investing: { items: { label: string; amount: number }[]; netCashFromInvesting: number }
    financing: { items: { label: string; amount: number }[]; netCashFromFinancing: number }
    summary: { openingCash: number; netChangeInCash: number; closingCash: number }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    fetch(`/api/accounting/reports/cash-flow?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        onData([
          { Section: 'Operating', Item: 'Net Income', Amount: d.operating.netIncome },
          ...d.operating.workingCapitalAdjustments.map((i: { label: string; amount: number }) => ({ Section: 'Operating', Item: i.label, Amount: i.amount })),
          { Section: 'Operating', Item: 'Net Cash from Operations', Amount: d.operating.netCashFromOperations },
          ...d.investing.items.map((i: { label: string; amount: number }) => ({ Section: 'Investing', Item: i.label, Amount: i.amount })),
          { Section: 'Investing', Item: 'Net Cash from Investing', Amount: d.investing.netCashFromInvesting },
          ...d.financing.items.map((i: { label: string; amount: number }) => ({ Section: 'Financing', Item: i.label, Amount: i.amount })),
          { Section: 'Financing', Item: 'Net Cash from Financing', Amount: d.financing.netCashFromFinancing },
          { Section: 'Summary', Item: 'Opening Cash', Amount: d.summary.openingCash },
          { Section: 'Summary', Item: 'Net Change in Cash', Amount: d.summary.netChangeInCash },
          { Section: 'Summary', Item: 'Closing Cash', Amount: d.summary.closingCash },
        ])
      })
      .catch(() => setError('Failed to load cash flow'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          <CashFlowActivitySection
            title="Operating Activities"
            netIncomeLine={data.operating.netIncome}
            items={data.operating.workingCapitalAdjustments}
            net={data.operating.netCashFromOperations}
          />
          <CashFlowActivitySection
            title="Investing Activities"
            items={data.investing.items}
            net={data.investing.netCashFromInvesting}
          />
          <CashFlowActivitySection
            title="Financing Activities"
            items={data.financing.items}
            net={data.financing.netCashFromFinancing}
          />

          {/* Summary */}
          <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Cash Summary</h4>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="flex justify-between px-5 py-2.5">
                <span className="text-gray-600">Opening Cash Balance</span>
                <span className="font-medium tabular-nums text-gray-900">{fmt(data.summary.openingCash)}</span>
              </div>
              <div className="flex justify-between px-5 py-2.5">
                <span className="text-gray-600">Net Change in Cash</span>
                <span className={`font-medium tabular-nums ${data.summary.netChangeInCash >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {data.summary.netChangeInCash >= 0 ? '+' : ''}{fmt(data.summary.netChangeInCash)}
                </span>
              </div>
              <div className="flex justify-between px-5 py-3 font-bold">
                <span className="text-gray-800">Closing Cash Balance</span>
                <span className={`tabular-nums text-base ${data.summary.closingCash >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {fmt(data.summary.closingCash)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Statement of Account (per customer)
// ─────────────────────────────────────────────────────────────────────────────

function StatementOfAccountReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [customerId, setCustomerId] = useState('')
  const [data, setData] = useState<{
    customer: { id: string; name: string; phone: string | null }
    period: { startDate: string | null; endDate: string | null }
    openingBalance: number
    rows: {
      date: string
      type: string
      reference: string
      description: string
      debit: number
      credit: number
      balance: number
    }[]
    totals: { totalDebits: number; totalCredits: number }
    closingBalance: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(Array.isArray(d) ? d : (d.customers ?? [])))
      .catch(() => {})
  }, [])

  const load = () => {
    if (!customerId) { setError('Select a customer first'); return }
    setLoading(true)
    setError('')
    const p = new URLSearchParams({ customerId })
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    fetch(`/api/accounting/reports/statement-of-account?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.rows.map((r: { date: string; type: string; reference: string; description: string; debit: number; credit: number; balance: number }) => ({
          Date: new Date(r.date).toLocaleDateString('en-GH'),
          Type: r.type, Reference: r.reference, Description: r.description,
          Debit: r.debit, Credit: r.credit, Balance: r.balance,
        })))
      })
      .catch(() => setError('Failed to load statement'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` — ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </div>
        <ReportBtn onClick={load} loading={loading} />
      </div>
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{data.customer.name}</p>
              {data.customer.phone && <p className="text-xs text-gray-400">{data.customer.phone}</p>}
            </div>
            <div className="text-right text-xs text-gray-500">
              {data.period.startDate && <p>From: {new Date(data.period.startDate).toLocaleDateString('en-GH')}</p>}
              {data.period.endDate && <p>To: {new Date(data.period.endDate).toLocaleDateString('en-GH')}</p>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 overflow-hidden shadow-sm text-sm">
            <div className="grid grid-cols-12 px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
              <span className="col-span-2">Date</span>
              <span className="col-span-2">Type</span>
              <span className="col-span-1">Ref</span>
              <span className="col-span-3">Description</span>
              <span className="col-span-1 text-right">Debit</span>
              <span className="col-span-1 text-right">Credit</span>
              <span className="col-span-2 text-right">Balance</span>
            </div>

            {/* Opening balance row */}
            <div className="grid grid-cols-12 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 font-medium">
              <span className="col-span-7">Opening Balance</span>
              <span className="col-span-1" />
              <span className="col-span-1" />
              <span className="col-span-2 text-right tabular-nums font-bold">{fmt(data.openingBalance)}</span>
            </div>

            {data.rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-gray-400">No transactions in this period.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 px-4 py-2.5 hover:bg-slate-50">
                    <span className="col-span-2 text-gray-500">
                      {new Date(r.date).toLocaleDateString('en-GH')}
                    </span>
                    <span className="col-span-2">
                      <span
                        className={`text-xs px-1.5 py-0.5  font-medium ${
                          r.type === 'SALE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.type === 'PAYMENT'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.type}
                      </span>
                    </span>
                    <span className="col-span-1 font-mono text-gray-400 text-xs">{r.reference}</span>
                    <span className="col-span-3 text-gray-700 truncate" title={r.description}>
                      {r.description}
                    </span>
                    <span className="col-span-1 text-right tabular-nums text-gray-700">
                      {r.debit > 0 ? fmt(r.debit) : '—'}
                    </span>
                    <span className="col-span-1 text-right tabular-nums text-emerald-700">
                      {r.credit > 0 ? fmt(r.credit) : '—'}
                    </span>
                    <span
                      className={`col-span-2 text-right tabular-nums font-semibold ${
                        r.balance > 0 ? 'text-gray-900' : r.balance < 0 ? 'text-emerald-700' : 'text-gray-400'
                      }`}
                    >
                      {fmt(Math.abs(r.balance))}{' '}
                      <span className="text-xs font-normal">
                        {r.balance > 0 ? 'Dr' : r.balance < 0 ? 'Cr' : ''}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-12 px-4 py-3 bg-gray-50 border-t-2 border-gray-200 text-sm font-bold">
              <span className="col-span-7 text-right text-slate-200">Totals</span>
              <span className="col-span-1 text-right tabular-nums">{fmt(data.totals.totalDebits)}</span>
              <span className="col-span-1 text-right tabular-nums text-emerald-700">{fmt(data.totals.totalCredits)}</span>
              <span
                className={`col-span-2 text-right tabular-nums text-base ${
                  data.closingBalance > 0 ? 'text-gray-900' : 'text-emerald-700'
                }`}
              >
                {fmt(Math.abs(data.closingBalance))}{' '}
                <span className="text-xs font-normal">
                  {data.closingBalance > 0 ? 'Dr' : data.closingBalance < 0 ? 'Cr' : ''}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Sales by Customer
// ─────────────────────────────────────────────────────────────────────────────

function SalesByCustomerReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Row = {
    customerId: string | null
    customerName: string
    phone: string | null
    totalSales: number
    totalCOGS: number
    grossProfit: number
    grossMarginPct: number
    amountPaid: number
    amountOwing: number
    transactionCount: number
  }
  type Data = {
    rows: Row[]
    totals: {
      totalSales: number
      totalCOGS: number
      grossProfit: number
      grossMarginPct: number
      amountPaid: number
      amountOwing: number
      transactionCount: number
    }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate) p.set('endDate', endDate)
    fetch(`/api/accounting/reports/sales-by-customer?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.rows.map((r: { customerName: string; phone: string | null; transactionCount: number; totalSales: number; totalCOGS: number; grossProfit: number; grossMarginPct: number; amountPaid: number; amountOwing: number }) => ({
          Customer: r.customerName, Phone: r.phone ?? '', Transactions: r.transactionCount,
          Revenue: r.totalSales, COGS: r.totalCOGS, 'Gross Profit': r.grossProfit,
          'Margin %': r.grossMarginPct.toFixed(1), Paid: r.amountPaid, Owing: r.amountOwing,
        })))
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-3">
          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No sales in this period.</p>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Customer</th>
                    <th className="text-right px-4 py-2.5">Txns</th>
                    <th className="text-right px-4 py-2.5">Revenue</th>
                    <th className="text-right px-4 py-2.5">COGS</th>
                    <th className="text-right px-4 py-2.5">Gross Profit</th>
                    <th className="text-right px-4 py-2.5">Margin %</th>
                    <th className="text-right px-4 py-2.5">Paid</th>
                    <th className="text-right px-4 py-2.5 text-amber-600">Owing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.customerName}</p>
                        {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{r.transactionCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmt(r.totalSales)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.totalCOGS)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(r.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.grossMarginPct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(r.amountPaid)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.amountOwing > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{r.amountOwing > 0 ? fmt(r.amountOwing) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total ({data.totals.transactionCount} txns)</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalSales)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalCOGS)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${data.totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(data.totals.grossProfit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{data.totals.grossMarginPct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(data.totals.amountPaid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{fmt(data.totals.amountOwing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Sales by Product
// ─────────────────────────────────────────────────────────────────────────────

function SalesByProductReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type Row = {
    itemId: string
    itemName: string
    categoryName: string | null
    quantitySold: number
    revenue: number
    cogs: number
    grossProfit: number
    grossMarginPct: number
    avgSellingPrice: number
  }
  type Data = {
    rows: Row[]
    totals: { quantitySold: number; revenue: number; cogs: number; grossProfit: number; grossMarginPct: number }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate) p.set('endDate', endDate)
    fetch(`/api/accounting/reports/sales-by-product?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.rows.map((r: { itemName: string; categoryName: string | null; quantitySold: number; avgSellingPrice: number; revenue: number; cogs: number; grossProfit: number; grossMarginPct: number }) => ({
          Product: r.itemName, Category: r.categoryName ?? '', 'Qty Sold': r.quantitySold,
          'Avg Price': r.avgSellingPrice, Revenue: r.revenue, COGS: r.cogs,
          'Gross Profit': r.grossProfit, 'Margin %': r.grossMarginPct.toFixed(1),
        })))
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-3">
          {data.rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No sales in this period.</p>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Product</th>
                    <th className="text-right px-4 py-2.5">Qty Sold</th>
                    <th className="text-right px-4 py-2.5">Avg Price</th>
                    <th className="text-right px-4 py-2.5">Revenue</th>
                    <th className="text-right px-4 py-2.5">COGS</th>
                    <th className="text-right px-4 py-2.5">Gross Profit</th>
                    <th className="text-right px-4 py-2.5">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={r.itemId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.itemName}</p>
                        {r.categoryName && <p className="text-xs text-gray-400">{r.categoryName}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.quantitySold}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(r.avgSellingPrice)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmt(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.cogs)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(r.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.grossMarginPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{data.totals.quantitySold}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.cogs)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${data.totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(data.totals.grossProfit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{data.totals.grossMarginPct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Expense by Vendor
// ─────────────────────────────────────────────────────────────────────────────

function ExpenseByVendorReport({ startDate, endDate, onData }: { startDate: string; endDate: string; onData: (rows: Record<string, unknown>[]) => void }) {
  type SupplierRow = {
    vendorId: string
    vendorName: string
    phone: string | null
    totalPurchases: number
    amountPaid: number
    amountOwing: number
    transactionCount: number
  }
  type ExpenseRow = { categoryKey: string; categoryName: string; totalAmount: number; transactionCount: number }
  type Data = {
    supplierRows: SupplierRow[]
    supplierTotals: { totalPurchases: number; amountPaid: number; amountOwing: number; transactionCount: number }
    expenseRows: ExpenseRow[]
    expenseTotals: { totalAmount: number; transactionCount: number }
    grandTotal: number
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate) p.set('endDate', endDate)
    fetch(`/api/accounting/reports/expense-by-vendor?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData([
          ...d.supplierRows.map((r: { vendorName: string; phone: string | null; transactionCount: number; totalPurchases: number; amountPaid: number; amountOwing: number }) => ({
            Section: 'Supplier Purchases', Vendor: r.vendorName, Phone: r.phone ?? '',
            Transactions: r.transactionCount, Total: r.totalPurchases, Paid: r.amountPaid, Owing: r.amountOwing,
          })),
          ...d.expenseRows.map((r: { categoryName: string; transactionCount: number; totalAmount: number }) => ({
            Section: 'Operating Expenses', Vendor: r.categoryName, Phone: '',
            Transactions: r.transactionCount, Total: r.totalAmount, Paid: '', Owing: '',
          })),
        ])
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <ReportBtn onClick={load} loading={loading} />
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-5">
          {/* Supplier purchases */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Supplier Purchases</h4>
            {data.supplierRows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No purchases in this period.</p>
            ) : (
              <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Supplier</th>
                      <th className="text-right px-4 py-2.5">Txns</th>
                      <th className="text-right px-4 py-2.5">Total</th>
                      <th className="text-right px-4 py-2.5">Paid</th>
                      <th className="text-right px-4 py-2.5 text-amber-600">Owing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.supplierRows.map((r) => (
                      <tr key={r.vendorId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900">{r.vendorName}</p>
                          {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.transactionCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmt(r.totalPurchases)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(r.amountPaid)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.amountOwing > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{r.amountOwing > 0 ? fmt(r.amountOwing) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                      <td className="px-4 py-3 text-slate-200">Subtotal</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{data.supplierTotals.transactionCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(data.supplierTotals.totalPurchases)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(data.supplierTotals.amountPaid)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">{fmt(data.supplierTotals.amountOwing)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Operating expenses */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Operating Expenses</h4>
            {data.expenseRows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No operating expenses in this period.</p>
            ) : (
              <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Category</th>
                      <th className="text-right px-4 py-2.5">Txns</th>
                      <th className="text-right px-4 py-2.5">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.expenseRows.map((r) => (
                      <tr key={r.categoryKey} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.categoryName}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.transactionCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmt(r.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                      <td className="px-4 py-3 text-slate-200">Subtotal</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{data.expenseTotals.transactionCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(data.expenseTotals.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <SummaryRow label="Grand Total Spend" value={data.grandTotal} large highlight />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Payroll Summary
// ─────────────────────────────────────────────────────────────────────────────

function PayrollSummaryReport({ onData }: { onData: (rows: Record<string, unknown>[]) => void }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear.toString())
  const [month, setMonth] = useState('')
  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  type PeriodRow = {
    id: string
    periodLabel: string
    employeeCount: number
    totalGross: number
    totalSSFEmployee: number
    totalSSFEmployer: number
    totalPAYE: number
    totalDeductions: number
    totalNetPay: number
    totalEmployerCost: number
    paidAt: string | null
  }
  type Data = {
    periodRows: PeriodRow[]
    totals: {
      totalGross: number
      totalSSFEmployee: number
      totalSSFEmployer: number
      totalPAYE: number
      totalDeductions: number
      totalNetPay: number
      totalEmployerCost: number
      periodsCount: number
    }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    if (!year) { setError('Enter a year'); return }
    setLoading(true)
    setError('')
    const p = new URLSearchParams({ year })
    if (month) p.set('month', month)
    fetch(`/api/accounting/reports/payroll-summary?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.periodRows.map((r: { periodLabel: string; employeeCount: number; totalGross: number; totalSSFEmployee: number; totalSSFEmployer: number; totalPAYE: number; totalDeductions: number; totalNetPay: number; totalEmployerCost: number }) => ({
          Period: r.periodLabel, Employees: r.employeeCount, 'Gross Pay': r.totalGross,
          'SSF (Emp)': r.totalSSFEmployee, 'SSF (Employer)': r.totalSSFEmployer,
          PAYE: r.totalPAYE, 'Total Deductions': r.totalDeductions,
          'Net Pay': r.totalNetPay, 'Employer Cost': r.totalEmployerCost,
        })))
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={2020}
            max={2030}
            className="w-28 border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Month (optional)</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Full Year</option>
            {MONTH_NAMES.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <ReportBtn onClick={load} loading={loading} />
      </div>
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          {data.periodRows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No paid payroll runs in this period.</p>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Period</th>
                    <th className="text-right px-4 py-2.5">Employees</th>
                    <th className="text-right px-4 py-2.5">Gross Pay</th>
                    <th className="text-right px-4 py-2.5">SSF (Emp)</th>
                    <th className="text-right px-4 py-2.5">PAYE</th>
                    <th className="text-right px-4 py-2.5">Total Deductions</th>
                    <th className="text-right px-4 py-2.5">Net Pay</th>
                    <th className="text-right px-4 py-2.5">Employer Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.periodRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.periodLabel}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.employeeCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{fmt(r.totalGross)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(r.totalSSFEmployee)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(r.totalPAYE)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(r.totalDeductions)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmt(r.totalNetPay)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.totalEmployerCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total ({data.totals.periodsCount} periods)</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalGross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalSSFEmployee)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalPAYE)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{fmt(data.totals.totalDeductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(data.totals.totalNetPay)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalEmployerCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Inventory Valuation
// ─────────────────────────────────────────────────────────────────────────────

function InventoryValuationReport({ onData }: { onData: (rows: Record<string, unknown>[]) => void }) {
  type ItemRow = {
    itemId: string
    itemName: string
    categoryName: string | null
    manufacturerName: string
    barcode: string | null
    quantityOnHand: number
    costPrice: number
    sellingPrice: number
    totalCostValue: number
    totalRetailValue: number
    potentialProfit: number
    expiryDate: string | null
    status: 'NORMAL' | 'LOW' | 'OUT_OF_STOCK' | 'EXPIRED'
  }
  type CatSummary = {
    categoryName: string
    itemCount: number
    totalCostValue: number
    totalRetailValue: number
  }
  type Data = {
    asOf: string
    rows: ItemRow[]
    categorySummary: CatSummary[]
    totals: {
      itemCount: number
      totalQuantity: number
      totalCostValue: number
      totalRetailValue: number
      potentialProfit: number
      outOfStockCount: number
      lowStockCount: number
      expiredCount: number
    }
  }
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'items' | 'summary'>('summary')

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/accounting/reports/inventory-valuation')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        onData(d.rows.map((r: { itemName: string; categoryName: string | null; manufacturerName: string; barcode: string | null; quantityOnHand: number; costPrice: number; sellingPrice: number; totalCostValue: number; totalRetailValue: number; potentialProfit: number; status: string }) => ({
          Item: r.itemName, Category: r.categoryName ?? '', Manufacturer: r.manufacturerName,
          Barcode: r.barcode ?? '', Qty: r.quantityOnHand, 'Cost/Unit': r.costPrice,
          'Selling Price': r.sellingPrice, 'Cost Value': r.totalCostValue,
          'Retail Value': r.totalRetailValue, 'Potential Profit': r.potentialProfit, Status: r.status,
        })))
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }

  const statusBadge = (status: ItemRow['status']) => {
    const map: Record<string, string> = {
      NORMAL: 'bg-emerald-50 text-emerald-700',
      LOW: 'bg-amber-50 text-amber-700',
      OUT_OF_STOCK: 'bg-red-50 text-red-700',
      EXPIRED: 'bg-gray-100 text-gray-600 line-through',
    }
    return (
      <span className={`text-xs px-1.5 py-0.5  font-medium ${map[status]}`}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ReportBtn onClick={load} loading={loading} />
        {data && (
          <div className="flex border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setView('summary')}
              className={`px-3 py-1.5 font-medium ${view === 'summary' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-slate-50'}`}
            >
              By Category
            </button>
            <button
              onClick={() => setView('items')}
              className={`px-3 py-1.5 font-medium ${view === 'items' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-slate-50'}`}
            >
              All Items
            </button>
          </div>
        )}
      </div>
      {error && <ErrMsg msg={error} />}
      {data && (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Stock Value (Cost)', value: fmt(data.totals.totalCostValue), color: 'text-gray-900' },
              { label: 'Retail Value', value: fmt(data.totals.totalRetailValue), color: 'text-blue-700' },
              { label: 'Potential Profit', value: fmt(data.totals.potentialProfit), color: 'text-emerald-700' },
              { label: 'Alert Items', value: `${data.totals.outOfStockCount} OOS · ${data.totals.lowStockCount} Low · ${data.totals.expiredCount} Exp`, color: 'text-amber-700' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className={`text-base font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {view === 'summary' ? (
            <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Category</th>
                    <th className="text-right px-4 py-2.5">Items</th>
                    <th className="text-right px-4 py-2.5">Cost Value</th>
                    <th className="text-right px-4 py-2.5">Retail Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.categorySummary.map((cat, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{cat.categoryName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{cat.itemCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmt(cat.totalCostValue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{fmt(cat.totalRetailValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-200">Total ({data.totals.itemCount} items)</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.totals.totalCostValue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-700">{fmt(data.totals.totalRetailValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Item</th>
                    <th className="text-right px-4 py-2.5">Qty</th>
                    <th className="text-right px-4 py-2.5">Cost/Unit</th>
                    <th className="text-right px-4 py-2.5">Cost Value</th>
                    <th className="text-right px-4 py-2.5">Retail Value</th>
                    <th className="text-right px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={r.itemId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{r.itemName}</p>
                        <p className="text-xs text-gray-400">{r.categoryName ?? 'Uncategorized'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.quantityOnHand}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(r.costPrice)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmt(r.totalCostValue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{fmt(r.totalRetailValue)}</td>
                      <td className="px-4 py-2.5 text-right">{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

type ReportType =
  | 'profit-loss'
  | 'balance-sheet'
  | 'trial-balance'
  | 'general-ledger'
  | 'ar-aging'
  | 'ap-aging'
  | 'cash-flow'
  | 'statement-of-account'
  | 'sales-by-customer'
  | 'sales-by-product'
  | 'expense-by-vendor'
  | 'payroll-summary'
  | 'inventory-valuation'

const GROUP_META: Record<string, { color: string; dot: string }> = {
  'Core':       { color: 'text-blue-600',   dot: 'bg-blue-500' },
  'Aging':      { color: 'text-amber-600',  dot: 'bg-amber-500' },
  'Cash':       { color: 'text-teal-600',   dot: 'bg-teal-500' },
  'Sales':      { color: 'text-violet-600', dot: 'bg-violet-500' },
  'HR & Stock': { color: 'text-rose-600',   dot: 'bg-rose-500' },
}

export default function AccountingReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('profit-loss')

  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [exportRows, setExportRows] = useState<Record<string, unknown>[]>([])

  const handleData = useCallback((rows: Record<string, unknown>[]) => setExportRows(rows), [])

  const tabs: { id: ReportType; label: string; icon: React.ReactNode; group: string }[] = [
    { id: 'profit-loss',          label: 'Profit & Loss',        icon: <TrendingUp className="w-4 h-4" />,   group: 'Core' },
    { id: 'balance-sheet',        label: 'Balance Sheet',        icon: <Scale className="w-4 h-4" />,        group: 'Core' },
    { id: 'trial-balance',        label: 'Trial Balance',        icon: <BarChart3 className="w-4 h-4" />,    group: 'Core' },
    { id: 'general-ledger',       label: 'General Ledger',       icon: <BookOpen className="w-4 h-4" />,     group: 'Core' },
    { id: 'ar-aging',             label: 'A/R Aging',            icon: <Users className="w-4 h-4" />,        group: 'Aging' },
    { id: 'ap-aging',             label: 'A/P Aging',            icon: <Truck className="w-4 h-4" />,        group: 'Aging' },
    { id: 'cash-flow',            label: 'Cash Flow',            icon: <Droplets className="w-4 h-4" />,     group: 'Cash' },
    { id: 'statement-of-account', label: 'Statement of Account', icon: <FileText className="w-4 h-4" />,     group: 'Cash' },
    { id: 'sales-by-customer',    label: 'Sales by Customer',    icon: <ShoppingCart className="w-4 h-4" />, group: 'Sales' },
    { id: 'sales-by-product',     label: 'Sales by Product',     icon: <Package className="w-4 h-4" />,      group: 'Sales' },
    { id: 'expense-by-vendor',    label: 'Expense by Vendor',    icon: <Receipt className="w-4 h-4" />,      group: 'Sales' },
    { id: 'payroll-summary',      label: 'Payroll Summary',      icon: <Wallet className="w-4 h-4" />,       group: 'HR & Stock' },
    { id: 'inventory-valuation',  label: 'Inventory Valuation',  icon: <Boxes className="w-4 h-4" />,        group: 'HR & Stock' },
  ]

  const groups = ['Core', 'Aging', 'Cash', 'Sales', 'HR & Stock']
  const activeTab = tabs.find((t) => t.id === activeReport)!

  const switchReport = (id: ReportType) => { setActiveReport(id); setExportRows([]) }
  const activeGroup = activeTab.group

  return (
    <AppLayout>
      {/* ── Dark hero banner ─────────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 mb-0">
        <div className="relative overflow-hidden bg-slate-900 px-6 sm:px-10 pt-8 pb-10">
          {/* decorative accents */}
          <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 bg-blue-600/10 border-l border-b border-blue-500/20" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 bg-blue-600/8 border-t border-r border-blue-500/15" />
          <div className="pointer-events-none absolute inset-x-0 top-[55%] h-px bg-white/5" />

          <div className="relative max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Financial Reports</h1>
                <p className="mt-1 text-slate-400 text-sm">13 reports · Double-entry accounting</p>
              </div>

              {/* Date range controls in hero */}
              <div className="flex items-center gap-3 bg-white/8 border border-white/12 px-4 py-3 flex-wrap shrink-0">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-white/10 border border-white/20 text-white text-sm px-3 py-1.5 focus:outline-none focus:border-blue-400 [color-scheme:dark]"
                    />
                  </div>
                  <span className="text-slate-600 text-sm self-end mb-2">→</span>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">To / As-of</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-white/10 border border-white/20 text-white text-sm px-3 py-1.5 focus:outline-none focus:border-blue-400 [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content below hero ───────────────────────────────────────────────── */}
      <div className="mt-6 space-y-0">

        {/* ── Report category cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {groups.map((group) => {
            const groupTabs = tabs.filter((t) => t.group === group)
            const isActive = activeGroup === group
            const meta = GROUP_META[group]
            return (
              <button
                key={group}
                onClick={() => switchReport(groupTabs[0].id)}
                className={`text-left p-4 border-2 transition-all shadow-sm ${
                  isActive
                    ? 'bg-white border-blue-500 shadow-blue-100 shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow'
                }`}
              >
                <div className={`w-2 h-2 -full mb-2.5 ${meta.dot}`} />
                <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${isActive ? meta.color : 'text-slate-400'}`}>
                  {group}
                </p>
                <p className="text-xs text-slate-500">{groupTabs.length} report{groupTabs.length > 1 ? 's' : ''}</p>
              </button>
            )
          })}
        </div>

        {/* ── Sidebar + panel layout ────────────────────────────────────────── */}
        <div className="flex gap-5 items-start">

          {/* Sidebar tab list */}
          <div className="hidden lg:flex flex-col w-52 shrink-0 bg-white border border-slate-200 shadow-sm overflow-hidden">
            {groups.map((group, gi) => {
              const groupTabs = tabs.filter((t) => t.group === group)
              const meta = GROUP_META[group]
              return (
                <div key={group}>
                  {gi > 0 && <div className="border-t border-slate-100" />}
                  <div className="px-4 pt-3 pb-1.5">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>{group}</p>
                  </div>
                  {groupTabs.map((tab) => {
                    const active = activeReport === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => switchReport(tab.id)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-all ${
                          active
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className={`shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}>{tab.icon}</span>
                        <span className="truncate">{tab.label}</span>
                      </button>
                    )
                  })}
                  <div className="h-1" />
                </div>
              )
            })}
          </div>

          {/* Mobile horizontal tab strip */}
          <div className="lg:hidden w-full overflow-x-auto -mx-1 px-1 pb-1">
            <div className="flex gap-1 border border-slate-200 bg-white p-1 min-w-max shadow-sm">
              {tabs.map((tab) => {
                const active = activeReport === tab.id
                const meta = GROUP_META[tab.group]
                return (
                  <button
                    key={tab.id}
                    onClick={() => switchReport(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-all ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : `text-slate-500 hover:bg-slate-100 hover:${meta.color}`
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Report panel */}
          <div className="flex-1 min-w-0">
            {/* Panel header */}
            <div className="bg-white border border-slate-200 shadow-sm mb-4 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className={`p-2 shrink-0 ${
                  activeGroup === 'Core'       ? 'bg-blue-100 text-blue-600' :
                  activeGroup === 'Aging'      ? 'bg-amber-100 text-amber-600' :
                  activeGroup === 'Cash'       ? 'bg-teal-100 text-teal-600' :
                  activeGroup === 'Sales'      ? 'bg-violet-100 text-violet-600' :
                  'bg-rose-100 text-rose-600'
                }`}>
                  {activeTab.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-900">{activeTab.label}</h2>
                  <p className="text-xs text-slate-400">
                    {startDate && endDate
                      ? `${new Date(startDate).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(endDate).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Set date range above'}
                  </p>
                </div>
                {/* Export buttons — shown only after data is loaded */}
                {exportRows.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => exportToExcel(exportRows, activeTab.label)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      title="Export to Excel"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Excel
                    </button>
                    <button
                      onClick={() => exportToPdf(activeTab.label)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                      title="Print / Save as PDF"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div id="report-panel-content" className="space-y-4">
              {activeReport === 'profit-loss'           && <ProfitLossReport          startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'balance-sheet'          && <BalanceSheetReport         asOf={endDate} onData={handleData} />}
              {activeReport === 'trial-balance'          && <TrialBalanceReport          startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'general-ledger'         && <GeneralLedgerReport         startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'ar-aging'               && <ArAgingReport               asOf={endDate} onData={handleData} />}
              {activeReport === 'ap-aging'               && <ApAgingReport               asOf={endDate} onData={handleData} />}
              {activeReport === 'cash-flow'              && <CashFlowReport              startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'statement-of-account'   && <StatementOfAccountReport    startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'sales-by-customer'      && <SalesByCustomerReport       startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'sales-by-product'       && <SalesByProductReport        startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'expense-by-vendor'      && <ExpenseByVendorReport       startDate={startDate} endDate={endDate} onData={handleData} />}
              {activeReport === 'payroll-summary'        && <PayrollSummaryReport        onData={handleData} />}
              {activeReport === 'inventory-valuation'    && <InventoryValuationReport    onData={handleData} />}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
