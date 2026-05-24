'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Printer } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'

interface AllowanceEntry { name: string; amount: number; isTaxable: boolean }
interface DeductionEntry { name: string; amount: number; isBeforeTax: boolean }

interface PayslipLine {
  basicSalary: number; overtime: number; bonus: number
  allowancesSnapshot: AllowanceEntry[]; deductionsSnapshot: DeductionEntry[]
  allowancesTotal: number; deductionsTotal: number
  grossPay: number; ssfEmployee: number; ssfEmployer: number
  taxableIncome: number; paye: number; netPay: number
  employee: {
    id: string; firstName: string; middleName: string | null; lastName: string; staffId: string
    position: string; department: string | null
    bankName: string | null; bankBranch: string | null; accountNumber: string | null
    momoProvider: string | null; momoNumber: string | null; momoAccountName: string | null
  }
}

interface PayrollRun {
  id: string; periodYear: number; periodMonth: number; status: string
  lines: PayslipLine[]
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const fmt = (n: number) => `GHS ${n.toFixed(2)}`

export default function PayslipPage() {
  const { id: runId, employeeId } = useParams<{ id: string; employeeId: string }>()
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/payroll/runs/${runId}`)
      .then((r) => r.json())
      .then((data) => { setRun(data.run ?? null); setLoading(false) })
  }, [runId])

  if (loading) return <AppLayout><div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div></AppLayout>
  if (!run) return <AppLayout><p className="text-sm text-red-500">Run not found.</p></AppLayout>

  const line = run.lines.find((l) => l.employee.id === employeeId)
  if (!line) return <AppLayout><p className="text-sm text-red-500">Employee not found in this run.</p></AppLayout>

  const emp = line.employee
  const allowances = line.allowancesSnapshot as AllowanceEntry[]
  const deductions = line.deductionsSnapshot as DeductionEntry[]
  const beforeTax = deductions.filter((d) => d.isBeforeTax)
  const afterTax  = deductions.filter((d) => !d.isBeforeTax)

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/payroll/runs/${runId}`} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" /> Back to Run
          </Link>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <Printer className="w-4 h-4" /> Print Payslip
          </button>
        </div>

        {/* Payslip card */}
        <div id="payslip" className="bg-white border border-gray-200 rounded-xl p-8 space-y-6 print:border-0 print:rounded-none print:p-0">
          {/* Header */}
          <div className="border-b border-gray-200 pb-4">
            <h1 className="text-xl font-bold text-gray-900">PAYSLIP</h1>
            <p className="text-sm text-gray-500 mt-0.5">{MONTH_NAMES[run.periodMonth]} {run.periodYear}</p>
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Employee Name</p>
              <p className="font-semibold text-gray-900">{emp.firstName} {emp.middleName ? `${emp.middleName} ` : ''}{emp.lastName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Staff ID</p>
              <p className="font-mono font-semibold text-gray-900">{emp.staffId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Position</p>
              <p className="font-medium text-gray-900">{emp.position}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Department</p>
              <p className="font-medium text-gray-900">{emp.department ?? '—'}</p>
            </div>
          </div>

          {/* Earnings */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Earnings</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="py-1.5 text-gray-700">Basic Salary</td>
                  <td className="py-1.5 text-right font-medium text-gray-900">{fmt(line.basicSalary)}</td>
                </tr>
                {allowances.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-gray-700">{a.name}{a.isTaxable ? <span className="ml-1 text-xs text-amber-600">(taxable)</span> : ''}</td>
                    <td className="py-1.5 text-right text-gray-700">{fmt(a.amount)}</td>
                  </tr>
                ))}
                {line.overtime > 0 && (
                  <tr>
                    <td className="py-1.5 text-gray-700">Overtime</td>
                    <td className="py-1.5 text-right text-gray-700">{fmt(line.overtime)}</td>
                  </tr>
                )}
                {line.bonus > 0 && (
                  <tr>
                    <td className="py-1.5 text-gray-700">Bonus</td>
                    <td className="py-1.5 text-right text-gray-700">{fmt(line.bonus)}</td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td className="py-2 font-bold text-gray-900">Gross Pay</td>
                  <td className="py-2 text-right font-bold text-gray-900">{fmt(line.grossPay)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Deductions</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="py-1.5 text-gray-700">SSF Employee (Tier 1)</td>
                  <td className="py-1.5 text-right text-red-600">({fmt(line.ssfEmployee)})</td>
                </tr>
                {beforeTax.map((d, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-gray-700">{d.name} <span className="text-xs text-blue-600">(before PAYE)</span></td>
                    <td className="py-1.5 text-right text-red-600">({fmt(d.amount)})</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 text-gray-700">PAYE <span className="text-xs text-gray-400">on {fmt(line.taxableIncome)}</span></td>
                  <td className="py-1.5 text-right text-red-600">({fmt(line.paye)})</td>
                </tr>
                {afterTax.map((d, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-gray-700">{d.name}</td>
                    <td className="py-1.5 text-right text-red-600">({fmt(d.amount)})</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200">
                  <td className="py-2 font-bold text-gray-900">Total Deductions</td>
                  <td className="py-2 text-right font-bold text-red-600">({fmt(line.ssfEmployee + line.paye + line.deductionsTotal)})</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Pay */}
          <div className="bg-emerald-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-gray-900">NET PAY</span>
            <span className="text-xl font-bold text-emerald-700">{fmt(line.netPay)}</span>
          </div>

          {/* Employer contribution note */}
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Employer SSF contribution: {fmt(line.ssfEmployer)} (not deducted from employee pay)
          </p>

          {/* Payment details */}
          {(emp.bankName || emp.momoProvider) && (
            <div className="border-t border-gray-100 pt-3 text-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Payment Details</p>
              {emp.bankName && (
                <p className="text-gray-700">{emp.bankName}{emp.bankBranch ? ` — ${emp.bankBranch}` : ''} · {emp.accountNumber}</p>
              )}
              {emp.momoProvider && (
                <p className="text-gray-700">{emp.momoProvider} MoMo · {emp.momoNumber}{emp.momoAccountName ? ` (${emp.momoAccountName})` : ''}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          #payslip { box-shadow: none !important; }
        }
      `}</style>
    </AppLayout>
  )
}
