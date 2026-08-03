import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { computePayrollLine, DEFAULT_SSF_EMPLOYEE_RATE, DEFAULT_SSF_EMPLOYER_RATE } from '@/lib/payroll/compute'
import type { AllowanceEntry, DeductionEntry } from '@/lib/payroll/compute'
import { Prisma } from '@prisma/client'
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

    const runDate = new Date(periodYear, periodMonth - 1, 1)

    // Fetch employees with their active components and active loans
    const employees = await prisma.employee.findMany({
      where: { tenantId: context!.tenantId, isActive: true },
      include: {
        components: {
          where: {
            isActive: true,
            effectiveFrom: { lte: runDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: runDate } }],
          },
          include: { component: true },
        },
        loans: {
          where: {
            tenantId: context!.tenantId,
            isActive: true,
            startDate: { lte: runDate },
            OR: [{ endDate: null }, { endDate: { gte: runDate } }],
          },
        },
      },
    })

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No active employees found' }, { status: 400 })
    }

    // Fetch SSF rates for this tenant (use defaults if none configured)
    const statutoryDeductions = await prisma.statutoryDeduction.findMany({
      where: { tenantId: context!.tenantId, isActive: true },
    })
    const ssfEmployeeRate = statutoryDeductions.find((d) => d.code === 'SSF_EMPLOYEE')?.rate ?? DEFAULT_SSF_EMPLOYEE_RATE
    const ssfEmployerRate = statutoryDeductions.find((d) => d.code === 'SSF_EMPLOYER')?.rate ?? DEFAULT_SSF_EMPLOYER_RATE

    // Per-employee overrides from body: { employeeId: { overtime?, bonus? } }
    const rawOverrides: Record<string, { overtime?: unknown; bonus?: unknown }> = body.overrides ?? {}

    const parseAmt = (value: unknown): number => {
      if (value === undefined || value === null || value === '') return 0
      const v = parseFloat(String(value))
      return Number.isFinite(v) && v >= 0 ? v : 0
    }

    const computedLines: {
      employee: typeof employees[0]
      allowances: AllowanceEntry[]
      deductions: DeductionEntry[]
      result: ReturnType<typeof computePayrollLine>
      loanDeductions: {
        loanId: string
        amount: number
        nextBalance: number
        shouldClose: boolean
      }[]
    }[] = []

    for (const emp of employees) {
      const ov = rawOverrides[emp.id] ?? {}

      const allowances: AllowanceEntry[] = emp.components
        .filter((a) => a.component.type === 'ALLOWANCE')
        .map((a) => ({
          name: a.component.name,
          amount: a.amount,
          isTaxable: a.component.isTaxable,
        }))

      const loanDeductions: { loanId: string; amount: number; nextBalance: number; shouldClose: boolean }[] = []
      const deductions: DeductionEntry[] = []

      for (const c of emp.components.filter((c) => c.component.type === 'DEDUCTION')) {
        deductions.push({ name: c.component.name, amount: c.amount, isBeforeTax: c.component.isBeforeTax })
      }

      // Add loan repayments as after-tax deductions
      for (const loan of emp.loans) {
        const amount = round2(Math.min(loan.monthlyDeduction, loan.balanceAmount))
        if (amount > 0) {
          const nextBalance = round2(Math.max(loan.balanceAmount - amount, 0))
          deductions.push({ name: loan.description, amount, isBeforeTax: false })
          loanDeductions.push({
            loanId: loan.id,
            amount,
            nextBalance,
            shouldClose: nextBalance <= 0,
          })
        }
      }

      const result = computePayrollLine({
        basicSalary: emp.basicSalary,
        allowances,
        deductions,
        overtime: parseAmt(ov.overtime),
        bonus: parseAmt(ov.bonus),
        isExemptFromPAYE: emp.isExemptFromPAYE,
        ssfEmployeeRate,
        ssfEmployerRate,
      })

      computedLines.push({ employee: emp, allowances, deductions, result, loanDeductions })
    }

    const totalGross       = round2(computedLines.reduce((s, l) => s + l.result.grossPay,       0))
    const totalSSFEmployee = round2(computedLines.reduce((s, l) => s + l.result.ssfEmployee,    0))
    const totalSSFEmployer = round2(computedLines.reduce((s, l) => s + l.result.ssfEmployer,    0))
    const totalPAYE        = round2(computedLines.reduce((s, l) => s + l.result.paye,           0))
    const totalDeductions  = round2(computedLines.reduce((s, l) => s + l.result.deductionsTotal, 0))
    const totalNetPay      = round2(computedLines.reduce((s, l) => s + l.result.netPay,         0))
    const loanRepayments = computedLines.flatMap(({ loanDeductions }) => loanDeductions)

    const run = await prisma.$transaction(async (tx) => {
      const payrollRun = await tx.payrollRun.create({
        data: {
          tenantId:        context!.tenantId,
          periodYear,
          periodMonth,
          status:          'DRAFT',
          totalGross,
          totalSSFEmployee,
          totalSSFEmployer,
          totalPAYE,
          totalDeductions,
          totalNetPay,
          createdById:     context!.user.id,
          lines: {
            create: computedLines.map(({ employee: emp, result }) => ({
              employeeId:        emp.id,
              basicSalary:       result.basicSalary,
              overtime:          result.overtime,
              bonus:             result.bonus,
              allowancesSnapshot: result.allowancesSnapshot as unknown as Prisma.InputJsonValue,
              deductionsSnapshot: result.deductionsSnapshot as unknown as Prisma.InputJsonValue,
              allowancesTotal:   result.allowancesTotal,
              deductionsTotal:   result.deductionsTotal,
              grossPay:          result.grossPay,
              ssfEmployee:       result.ssfEmployee,
              ssfEmployer:       result.ssfEmployer,
              taxableIncome:     result.taxableIncome,
              paye:              result.paye,
              netPay:            result.netPay,
            })),
          },
        },
        select: {
          id: true,
          periodYear: true,
          periodMonth: true,
          status: true,
          totalGross: true,
          totalSSFEmployee: true,
          totalSSFEmployer: true,
          totalPAYE: true,
          totalDeductions: true,
          totalNetPay: true,
          createdAt: true,
        },
      })

      if (loanRepayments.length > 0) {
        await tx.loanRepayment.createMany({
          // payrollRunId links the repayment back to the run, so deleting a
          // draft can restore the loan balance instead of orphaning it.
          data: loanRepayments.map(({ loanId, amount }) => ({
            loanId,
            amount,
            payrollRunId: run.id,
          })),
        })

        for (const { loanId, nextBalance, shouldClose } of loanRepayments) {
          await tx.employeeLoan.update({
            where: { id: loanId },
            data: {
              balanceAmount: nextBalance,
              isActive: !shouldClose,
            },
          })
        }
      }

      return payrollRun
    }, {
      maxWait: 10_000,
      timeout: 60_000,
    })

    return NextResponse.json({ run }, { status: 201 })
  } catch (err) {
    console.error('Failed to create payroll run:', err)
    return NextResponse.json({ error: 'Failed to create payroll run' }, { status: 500 })
  }
}
