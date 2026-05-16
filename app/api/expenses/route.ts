import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { ExpenseCategory, PaymentMethod } from '@prisma/client'
import { applyBranchScope, requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { postExpenseJournal } from '@/lib/accounting/journalEngine'

/**
 * Expenses API Routes
 *
 * GET  /api/expenses - List expenses (with optional date/category filters)
 * POST /api/expenses - Create a new expense
 */

const VALID_CATEGORIES = Object.values(ExpenseCategory)

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_expenses')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (category && VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      where.category = category as ExpenseCategory
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

    // Group totals by category
    const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount
      return acc
    }, {})

    return NextResponse.json({ expenses, totalAmount, byCategory })
  } catch (err) {
    console.error('Failed to fetch expenses:', err)
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_expenses')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before recording an expense.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const { amount, category, description, paidBy } = body

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    if (!category || !VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      return NextResponse.json(
        { error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const tenantSettings = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: { enableAccounting: true },
    })
    const accountingEnabled = tenantSettings?.enableAccounting ?? false

    const validMethods: string[] = Object.values(PaymentMethod)
    const paymentMethod: PaymentMethod = validMethods.includes(body.paymentMethod)
      ? (body.paymentMethod as PaymentMethod)
      : PaymentMethod.CASH

    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          amount: parseFloat(amount),
          category: category as ExpenseCategory,
          description: description.trim(),
          paidBy: paidBy?.trim() || null,
        },
      })

      if (accountingEnabled) {
        await postExpenseJournal(tx, {
          tenantId: context!.tenantId,
          expenseId: newExpense.id,
          postedById: context!.user.id,
          amount: parseFloat(amount),
          category: category as ExpenseCategory,
          paymentMethod,
        })
      }

      return newExpense
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    console.error('Failed to create expense:', err)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
