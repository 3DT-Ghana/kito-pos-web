import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { postPayrollJournal } from '@/lib/accounting/journalEngine'
import { round2 } from '@/lib/accounting/accounts'
import { seedDefaultAccounts } from '@/lib/accounting/seedAccounts'
const EMPLOYER_TIER2_RATE = 0.05
import { PaymentMethod } from '@prisma/client'
import { requireTenantFeature } from '@/lib/tenant/features'

interface RouteParams { params: Promise<{ id: string }> }

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
    if (!authorized) return permError!

    const { id } = await params
    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        lines: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, staffId: true, position: true, department: true, employmentType: true,
                bankName: true, bankBranch: true, accountNumber: true,
                momoProvider: true, momoNumber: true, momoAccountName: true },
            },
          },
          orderBy: { employee: { lastName: 'asc' } },
        },
        createdBy:  { select: { name: true } },
        approvedBy: { select: { name: true } },
        paidBy:     { select: { name: true } },
      },
    })
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    return NextResponse.json({ run })
  } catch (err) {
    console.error('Failed to fetch payroll run:', err)
    return NextResponse.json({ error: 'Failed to fetch payroll run' }, { status: 500 })
  }
}

/**
 * PATCH /api/payroll/runs/[id]
 * Body: { action: 'approve' | 'pay' }
 *
 * approve: DRAFT → APPROVED  (requires approve_payroll)
 * pay:     APPROVED → PAID   (requires run_payroll; posts journal if accounting enabled)
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { id } = await params
    const body = await req.json()
    const action: string = body.action

    if (!['approve', 'pay'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "pay"' }, { status: 400 })
    }

    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { lines: { select: { basicSalary: true } } },
    })
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

    if (action === 'approve') {
      const { authorized, error: permError } = requirePermission(context!, 'approve_payroll')
      if (!authorized) return permError!

      if (run.status !== 'DRAFT') {
        return NextResponse.json({ error: `Run is already ${run.status.toLowerCase()}` }, { status: 409 })
      }

      const updated = await prisma.payrollRun.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: context!.user.id, approvedAt: new Date() },
      })
      return NextResponse.json(updated)
    }

    // action === 'pay'
    const { authorized, error: permError } = requirePermission(context!, 'run_payroll')
    if (!authorized) return permError!

    if (run.status !== 'APPROVED') {
      return NextResponse.json(
        { error: run.status === 'PAID' ? 'Run is already paid' : 'Run must be approved before marking as paid' },
        { status: 409 }
      )
    }

    const paymentMethod: PaymentMethod = Object.values(PaymentMethod).includes(body.paymentMethod)
      ? body.paymentMethod as PaymentMethod
      : PaymentMethod.BANK

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })

    const periodLabel = `${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear}`
    const totalTier2Employer = round2(
      run.lines.reduce((sum, line) => sum + (line.basicSalary * EMPLOYER_TIER2_RATE), 0)
    )

    if (tenant?.enableAccounting) {
      await seedDefaultAccounts(context!.tenantId)
    }

    const updated = await prisma.$transaction(async tx => {
      let journalEntryId: string | undefined

      if (tenant?.enableAccounting) {
        journalEntryId = await postPayrollJournal(tx, {
          tenantId:         context!.tenantId,
          postedById:       context!.user.id,
          payrollRunId:     run.id,
          periodLabel,
          totalGross:       run.totalGross,
          totalSSFEmployee: run.totalSSFEmployee,
          totalSSFEmployer: run.totalSSFEmployer,
          totalTier2Employer,
          totalPAYE:        run.totalPAYE,
          totalOtherDeductions: run.totalDeductions,
          totalNetPay:      run.totalNetPay,
          paymentMethod,
        })
      }

      return tx.payrollRun.update({
        where: { id },
        data: {
          status:         'PAID',
          paidById:       context!.user.id,
          paidAt:         new Date(),
          ...(journalEntryId && { journalEntryId }),
        },
      })
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update payroll run:', err)
    return NextResponse.json({ error: 'Failed to update payroll run' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'run_payroll')
    if (!authorized) return permError!

    const { id } = await params
    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId: context!.tenantId },
    })
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

    if (run.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only DRAFT runs can be deleted' },
        { status: 409 }
      )
    }

    await prisma.payrollRun.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete payroll run:', err)
    return NextResponse.json({ error: 'Failed to delete payroll run' }, { status: 500 })
  }
}
