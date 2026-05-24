'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { BarChart3, Printer } from 'lucide-react'

type ReportType = 'summary' | 'paye' | 'ssf' | 'momo' | 'bank'

interface AllowanceEntry { name: string; amount: number; isTaxable: boolean }
interface DeductionEntry { name: string; amount: number; isBeforeTax: boolean }

interface RunLine {
  basicSalary: number; overtime: number; bonus: number
  allowancesSnapshot: AllowanceEntry[]; deductionsSnapshot: DeductionEntry[]
  grossPay: number; ssfEmployee: number; ssfEmployer: number
  taxableIncome: number; paye: number; netPay: number
  employee: {
    id: string; firstName: string; lastName: string; staffId: string
    position: string; department: string | null
    bankName: string | null; bankBranch: string | null; accountNumber: string | null
    momoProvider: string | null; momoNumber: string | null; momoAccountName: string | null
  }
}

interface PayrollRun {
  id: string; periodYear: number; periodMonth: number; status: string
  totalGross: number; totalSSFEmployee: number; totalSSFEmployer: number
  totalPAYE: number; totalDeductions: number; totalNetPay: number
  _count?: { lines: number }
  lines: RunLine[]
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const fmt = (n: number) => n.toFixed(2)
const REPORT_LABELS: Record<ReportType, string> = {
  summary: 'Payroll Summary', paye: 'PAYE Report', ssf: 'SSF Report',
  momo: 'MoMo Payment List', bank: 'Bank Payment List',
}

export default function PayrollReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [reportType, setReportType] = useState<ReportType>('summary')
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/payroll/runs?page=1&limit=50`)
    if (!res.ok) { setError('Failed to load runs'); setLoading(false); return }
    const data = await res.json()
    const found = (data.runs as PayrollRun[]).find((r) => r.periodYear === year && r.periodMonth === month)
    if (!found) { setError(`No payroll run found for ${MONTH_NAMES[month]} ${year}`); setRun(null); setLoading(false); return }
    // Fetch full run with lines
    const full = await fetch(`/api/payroll/runs/${found.id}`)
    if (!full.ok) { setError('Failed to load run details'); setLoading(false); return }
    const fullData = await full.json()
    setRun(fullData.run)
    setLoading(false)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Payroll Reports</h1>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {(Object.entries(REPORT_LABELS) as [ReportType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        {run && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between print:hidden">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{REPORT_LABELS[reportType]}</h2>
                <p className="text-xs text-gray-500">{MONTH_NAMES[run.periodMonth]} {run.periodYear} · Status: {run.status}</p>
              </div>
              <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>

            <div className="overflow-x-auto">
              {reportType === 'summary' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2.5 text-left font-semibold">Metric</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Amount (GHS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      ['Employees', `${run.lines.length}`],
                      ['Total Gross Pay', fmt(run.totalGross)],
                      ['Total SSF (Employee)', fmt(run.totalSSFEmployee)],
                      ['Total SSF (Employer)', fmt(run.totalSSFEmployer)],
                      ['Total PAYE', fmt(run.totalPAYE)],
                      ['Total Deductions', fmt(run.totalDeductions)],
                      ['Total Net Pay', fmt(run.totalNetPay)],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="px-5 py-3 text-gray-700">{label}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'paye' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2 text-left font-semibold">Staff ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-right font-semibold">Basic</th>
                      <th className="px-3 py-2 text-right font-semibold">Taxable Income</th>
                      <th className="px-5 py-2 text-right font-semibold">PAYE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {run.lines.map((l) => (
                      <tr key={l.employee.id}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.employee.staffId}</td>
                        <td className="px-3 py-3 text-gray-900">{l.employee.firstName} {l.employee.lastName}</td>
                        <td className="px-3 py-3 text-right text-gray-500">{fmt(l.basicSalary)}</td>
                        <td className="px-3 py-3 text-right text-gray-500">{fmt(l.taxableIncome)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(l.paye)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-5 py-2.5 font-bold text-gray-900" colSpan={4}>Total PAYE</td>
                      <td className="px-5 py-2.5 text-right font-bold text-gray-900">{fmt(run.totalPAYE)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {reportType === 'ssf' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2 text-left font-semibold">Staff ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-right font-semibold">Basic Salary</th>
                      <th className="px-3 py-2 text-right font-semibold">Employee (5.5%)</th>
                      <th className="px-5 py-2 text-right font-semibold">Employer (13%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {run.lines.map((l) => (
                      <tr key={l.employee.id}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.employee.staffId}</td>
                        <td className="px-3 py-3 text-gray-900">{l.employee.firstName} {l.employee.lastName}</td>
                        <td className="px-3 py-3 text-right text-gray-500">{fmt(l.basicSalary)}</td>
                        <td className="px-3 py-3 text-right text-gray-500">{fmt(l.ssfEmployee)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(l.ssfEmployer)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-5 py-2.5 font-bold text-gray-900" colSpan={3}>Totals</td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900">{fmt(run.totalSSFEmployee)}</td>
                      <td className="px-5 py-2.5 text-right font-bold text-gray-900">{fmt(run.totalSSFEmployer)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {reportType === 'momo' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2 text-left font-semibold">Staff ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Provider</th>
                      <th className="px-3 py-2 text-left font-semibold">Number</th>
                      <th className="px-3 py-2 text-left font-semibold">Account Name</th>
                      <th className="px-5 py-2 text-right font-semibold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {run.lines.filter((l) => l.employee.momoProvider).map((l) => (
                      <tr key={l.employee.id}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.employee.staffId}</td>
                        <td className="px-3 py-3 text-gray-900">{l.employee.firstName} {l.employee.lastName}</td>
                        <td className="px-3 py-3 text-gray-700">{l.employee.momoProvider}</td>
                        <td className="px-3 py-3 text-gray-700">{l.employee.momoNumber}</td>
                        <td className="px-3 py-3 text-gray-700">{l.employee.momoAccountName ?? '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(l.netPay)}</td>
                      </tr>
                    ))}
                    {run.lines.filter((l) => !l.employee.momoProvider).length === run.lines.length && (
                      <tr><td colSpan={6} className="px-5 py-4 text-center text-gray-400 text-sm">No employees with MoMo payment details.</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {reportType === 'bank' && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2 text-left font-semibold">Staff ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Bank</th>
                      <th className="px-3 py-2 text-left font-semibold">Branch</th>
                      <th className="px-3 py-2 text-left font-semibold">Account</th>
                      <th className="px-5 py-2 text-right font-semibold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {run.lines.filter((l) => l.employee.bankName).map((l) => (
                      <tr key={l.employee.id}>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.employee.staffId}</td>
                        <td className="px-3 py-3 text-gray-900">{l.employee.firstName} {l.employee.lastName}</td>
                        <td className="px-3 py-3 text-gray-700">{l.employee.bankName}</td>
                        <td className="px-3 py-3 text-gray-700">{l.employee.bankBranch ?? '—'}</td>
                        <td className="px-3 py-3 font-mono text-gray-700">{l.employee.accountNumber}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(l.netPay)}</td>
                      </tr>
                    ))}
                    {run.lines.filter((l) => !l.employee.bankName).length === run.lines.length && (
                      <tr><td colSpan={6} className="px-5 py-4 text-center text-gray-400 text-sm">No employees with bank payment details.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
