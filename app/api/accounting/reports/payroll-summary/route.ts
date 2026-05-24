import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_accounting_reports')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    if (!yearParam) {
      return NextResponse.json({ error: 'year is required' }, { status: 400 })
    }

    const year = parseInt(yearParam, 10)
    const month = monthParam ? parseInt(monthParam, 10) : undefined

    const whereClause: Record<string, unknown> = {
      tenantId: context!.tenantId,
      status: 'PAID',
      periodYear: year,
      ...(month !== undefined ? { periodMonth: month } : {}),
    }

    const runs = await prisma.payrollRun.findMany({
      where: whereClause,
      select: {
        id: true,
        periodYear: true,
        periodMonth: true,
        totalGross: true,
        totalSSFEmployee: true,
        totalSSFEmployer: true,
        totalPAYE: true,
        totalDeductions: true,
        totalNetPay: true,
        paidAt: true,
        lines: {
          select: {
            employeeId: true,
            employee: { select: { firstName: true, lastName: true } },
            grossPay: true,
            ssfEmployee: true,
            ssfEmployer: true,
            paye: true,
            deductionsTotal: true,
            netPay: true,
          },
        },
      },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })

    const MONTH_NAMES = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    const periodRows = runs.map((run) => ({
      id: run.id,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      periodLabel: `${MONTH_NAMES[run.periodMonth]} ${run.periodYear}`,
      employeeCount: run.lines.length,
      totalGross: run.totalGross,
      totalSSFEmployee: run.totalSSFEmployee,
      totalSSFEmployer: run.totalSSFEmployer,
      totalPAYE: run.totalPAYE,
      totalDeductions: run.totalDeductions,
      totalNetPay: run.totalNetPay,
      totalEmployerCost: round2(run.totalGross + run.totalSSFEmployer),
      paidAt: run.paidAt,
    }))

    type EmployeeRow = {
      employeeId: string; employeeName: string
      totalGross: number; totalSSFEmployee: number; totalSSFEmployer: number
      totalPAYE: number; totalDeductions: number; totalNetPay: number; periodsCount: number
    }

    const employeeMap = new Map<string, EmployeeRow>()

    for (const run of runs) {
      for (const line of run.lines) {
        if (!employeeMap.has(line.employeeId)) {
          employeeMap.set(line.employeeId, {
            employeeId: line.employeeId,
            employeeName: `${line.employee.firstName} ${line.employee.lastName}`,
            totalGross: 0, totalSSFEmployee: 0, totalSSFEmployer: 0,
            totalPAYE: 0, totalDeductions: 0, totalNetPay: 0, periodsCount: 0,
          })
        }
        const row = employeeMap.get(line.employeeId)!
        row.totalGross       = round2(row.totalGross + line.grossPay)
        row.totalSSFEmployee = round2(row.totalSSFEmployee + line.ssfEmployee)
        row.totalSSFEmployer = round2(row.totalSSFEmployer + line.ssfEmployer)
        row.totalPAYE        = round2(row.totalPAYE + line.paye)
        row.totalDeductions  = round2(row.totalDeductions + line.deductionsTotal)
        row.totalNetPay      = round2(row.totalNetPay + line.netPay)
        row.periodsCount     += 1
      }
    }

    const employeeRows = Array.from(employeeMap.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName)
    )

    const totals = {
      totalGross:       round2(periodRows.reduce((s, r) => s + r.totalGross,       0)),
      totalSSFEmployee: round2(periodRows.reduce((s, r) => s + r.totalSSFEmployee, 0)),
      totalSSFEmployer: round2(periodRows.reduce((s, r) => s + r.totalSSFEmployer, 0)),
      totalPAYE:        round2(periodRows.reduce((s, r) => s + r.totalPAYE,        0)),
      totalDeductions:  round2(periodRows.reduce((s, r) => s + r.totalDeductions,  0)),
      totalNetPay:      round2(periodRows.reduce((s, r) => s + r.totalNetPay,      0)),
      totalEmployerCost:round2(periodRows.reduce((s, r) => s + r.totalEmployerCost,0)),
      periodsCount: periodRows.length,
    }

    return NextResponse.json({ year, month, periodRows, employeeRows, totals })
  } catch (err) {
    console.error('Payroll Summary report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
