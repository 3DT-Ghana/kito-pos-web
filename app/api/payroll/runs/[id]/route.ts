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

      // Conditional on DRAFT. An unconditional write could land after a
      // concurrent "pay" had already set PAID, silently reverting the run to
      // APPROVED — which then made it payable, and journalable, a second time.
      const approved = await prisma.payrollRun.updateMany({
        where: { id, tenantId: context!.tenantId, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedById: context!.user.id, approvedAt: new Date() },
      })
      if (approved.count !== 1) {
        return NextResponse.json({ error: 'This payroll run is no longer a draft.' }, { status: 409 })
      }
      const updated = await prisma.payrollRun.findFirst({ where: { id } })
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
      // Claim the run before doing anything else. The status check above runs
      // outside this transaction, so two concurrent "Disburse" requests both
      // saw APPROVED and both posted a full payroll journal — doubling gross
      // wages, employer SSF, and every statutory payable in the GL, with the
      // first journal orphaned and invisible from the UI but still in the
      // trial balance. JournalEntry.payrollRunId is not unique, so nothing at
      // the database level would have caught it.
      const claimed = await tx.payrollRun.updateMany({
        where: { id, tenantId: context!.tenantId, status: 'APPROVED' },
        data: {
          status:   'PAID',
          paidById: context!.user.id,
          paidAt:   new Date(),
        },
      })
      if (claimed.count !== 1) {
        throw new Error('This payroll run has already been paid.')
      }

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

      // Status was set by the claim above; this only records the journal link.
      if (journalEntryId) {
        await tx.payrollRun.update({
          where: { id },
          data: { journalEntryId },
        })
      }

      return tx.payrollRun.findFirstOrThrow({ where: { id } })
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update payroll run:', err)
    const message = err instanceof Error ? err.message : 'Failed to update payroll run'
    const isConflict = message.includes('already been paid')
    return NextResponse.json(
      { error: isConflict ? message : 'Failed to update payroll run' },
      { status: isConflict ? 409 : 500 }
    )
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

    // Loan balances are decremented when the draft is created, so deleting the
    // draft must give them back. Without this, create-then-delete credited the
    // employee with a repayment they never made — repeat the cycle and a loan
    // balance could be wiped out entirely, with no audit trail and the loan
    // auto-closed once it reached zero.
    await prisma.$transaction(async (tx) => {
      const repayments = await tx.loanRepayment.findMany({
        where: { payrollRunId: id },
        select: { id: true, loanId: true, amount: true },
      })

      const deleted = await tx.payrollRun.deleteMany({
        where: { id, tenantId: context!.tenantId, status: 'DRAFT' },
      })
      if (deleted.count !== 1) {
        throw new Error('This payroll run is no longer a draft.')
      }

      for (const repayment of repayments) {
        await tx.employeeLoan.update({
          where: { id: repayment.loanId },
          data: {
            balanceAmount: { increment: repayment.amount },
            // Reopen a loan this run had closed on reaching zero
            isActive: true,
          },
        })
      }
      await tx.loanRepayment.deleteMany({ where: { payrollRunId: id } })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete payroll run:', err)
    const message = err instanceof Error ? err.message : 'Failed to delete payroll run'
    const isConflict = message.includes('no longer a draft')
    return NextResponse.json(
      { error: isConflict ? message : 'Failed to delete payroll run' },
      { status: isConflict ? 409 : 500 }
    )
  }
}
