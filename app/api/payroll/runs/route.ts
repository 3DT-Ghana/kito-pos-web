import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { computePayrollLine } from '@/lib/payroll/compute'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))
    const skip  = (page - 1) * limit

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where: { tenantId: context!.tenantId },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        skip,
        take: limit,
        include: {
          _count: { select: { lines: true } },
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
      }),
      prisma.payrollRun.count({ where: { tenantId: context!.tenantId } }),
    ])

    return NextResponse.json({ runs, total, page, limit })
  } catch (err) {
    console.error('Failed to fetch payroll runs:', err)
    return NextResponse.json({ error: 'Failed to fetch payroll runs' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'run_payroll')
    if (!authorized) return permError!

    const body = await req.json()
    const periodYear  = parseInt(body.periodYear)
    const periodMonth = parseInt(body.periodMonth)

    if (isNaN(periodYear) || periodYear < 2000 || periodYear > 2100) {
      return NextResponse.json({ error: 'Invalid period year' }, { status: 400 })
    }
    if (isNaN(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json({ error: 'Period month must be between 1 and 12' }, { status: 400 })
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { tenantId_periodYear_periodMonth: { tenantId: context!.tenantId, periodYear, periodMonth } },
    })
    if (existing) {
      return NextResponse.json(
        { error: `A payroll run for ${periodYear}-${String(periodMonth).padStart(2, '0')} already exists` },
        { status: 409 }
      )
    }

    const employees = await prisma.employee.findMany({
      where: { tenantId: context!.tenantId, isActive: true },
    })
    if (employees.length === 0) {
      return NextResponse.json({ error: 'No active employees found' }, { status: 400 })
    }

    const unsupportedEmployees = employees.filter(employee => employee.ssfTier !== 'TIER1')
    if (unsupportedEmployees.length > 0) {
      const names = unsupportedEmployees.slice(0, 3).map(employee => employee.name).join(', ')
      return NextResponse.json(
        {
          error: `Payroll currently supports Tier 1 employees only. Update these employee records first: ${names}${unsupportedEmployees.length > 3 ? ', …' : ''}`,
        },
        { status: 400 }
      )
    }

    // Per-employee overrides from request body (optional): { employeeId: { allowances, overtime, bonus, otherDeductions } }
    const rawOverrides: Record<string, { allowances?: unknown; overtime?: unknown; bonus?: unknown; otherDeductions?: unknown }> =
      body.overrides ?? {}
    const parseOverrideAmount = (value: unknown, label: string): number => {
      if (value === undefined || value === null || value === '') return 0
      const parsed = parseFloat(String(value))
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${label} must be a non-negative number`)
      }
      return parsed
    }

    let lines
    try {
      lines = employees.map(emp => {
        const ov = rawOverrides[emp.id] ?? {}
        return {
          employee: emp,
          result: computePayrollLine({
            basicSalary:      emp.basicSalary,
            allowances:       parseOverrideAmount(ov.allowances, `${emp.name}: allowances`),
            overtime:         parseOverrideAmount(ov.overtime, `${emp.name}: overtime`),
            bonus:            parseOverrideAmount(ov.bonus, `${emp.name}: bonus`),
            otherDeductions:  parseOverrideAmount(ov.otherDeductions, `${emp.name}: other deductions`),
            isExemptFromPAYE: emp.isExemptFromPAYE,
          }),
        }
      })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid payroll overrides supplied' },
        { status: 400 }
      )
    }

    const totalGross        = round2(lines.reduce((s, l) => s + l.result.grossPay,        0))
    const totalSSFEmployee  = round2(lines.reduce((s, l) => s + l.result.ssfEmployee,     0))
    const totalSSFEmployer  = round2(lines.reduce((s, l) => s + l.result.ssfEmployer,     0))
    const totalPAYE         = round2(lines.reduce((s, l) => s + l.result.paye,            0))
    const totalOtherDed     = round2(lines.reduce((s, l) => s + l.result.otherDeductions, 0))
    const totalNetPay       = round2(lines.reduce((s, l) => s + l.result.netPay,          0))

    const run = await prisma.$transaction(async tx => {
      const payrollRun = await tx.payrollRun.create({
        data: {
          tenantId:         context!.tenantId,
          periodYear,
          periodMonth,
          status:           'DRAFT',
          totalGross,
          totalSSFEmployee,
          totalSSFEmployer,
          totalPAYE,
          totalOtherDeductions: totalOtherDed,
          totalNetPay,
          createdById:      context!.user.id,
          lines: {
            create: lines.map(({ employee: emp, result }) => ({
              employeeId:      emp.id,
              basicSalary:     result.basicSalary,
              allowances:      result.allowances,
              overtime:        result.overtime,
              bonus:           result.bonus,
              grossPay:        result.grossPay,
              ssfEmployee:     result.ssfEmployee,
              ssfEmployer:     result.ssfEmployer,
              taxableIncome:   result.taxableIncome,
              paye:            result.paye,
              otherDeductions: result.otherDeductions,
              netPay:          result.netPay,
            })),
          },
        },
        include: {
          lines: { include: { employee: { select: { id: true, name: true, staffId: true, position: true, department: true } } } },
          createdBy: { select: { name: true } },
        },
      })
      return payrollRun
    })

    return NextResponse.json({ run }, { status: 201 })
  } catch (err) {
    console.error('Failed to create payroll run:', err)
    return NextResponse.json({ error: 'Failed to create payroll run' }, { status: 500 })
  }
}
