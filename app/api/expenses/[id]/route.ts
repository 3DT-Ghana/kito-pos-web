import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'

/**
 * DELETE /api/expenses/[id] - Delete an expense
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'delete_expenses')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before deleting an expense.'
    )
    if (branchError) return branchError

    const expense = await prisma.expense.findFirst({
      where: {
        id,
        tenantId: context!.tenantId,
        // Strict branch equality. The previous `OR: [{branchId}, {branchId: null}]`
        // let a branch user delete tenant-wide expenses that `applyBranchScope`
        // hides from their own list — the delete reached further than the read.
        ...(context!.branchesEnabled && branchId ? { branchId } : {}),
      },
    })

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Only a live POSTED entry blocks deletion. A REVERSED or VOID entry has no
    // accounting impact left, so blocking on it stranded the expense forever
    // with a message telling the user to do what they had already done.
    const expenseJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, expenseId: id, status: 'POSTED' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (expenseJournal) {
      return NextResponse.json(
        {
          error: `This expense is posted to the accounts (${expenseJournal.entryNumber}). Reverse that journal entry first, then delete the expense.`,
        },
        { status: 409 }
      )
    }

    await prisma.expense.deleteMany({ where: { id, tenantId: context!.tenantId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete expense:', err)
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
