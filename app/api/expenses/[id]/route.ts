import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

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

    const expense = await prisma.expense.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
    })

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const expenseJournal = await prisma.journalEntry.findFirst({
      where: { tenantId: context!.tenantId, expenseId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { entryNumber: true, status: true },
    })
    if (expenseJournal) {
      return NextResponse.json(
        {
          error: `This expense already has accounting history (${expenseJournal.entryNumber}, ${expenseJournal.status}). Posted expenses must be reversed instead of deleted.`,
        },
        { status: 409 }
      )
    }

    await prisma.expense.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete expense:', err)
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
