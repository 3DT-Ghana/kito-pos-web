import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/expense-by-vendor
 * Purchases grouped by supplier + operating expenses for a date range.
 *
 * Query params:
 *   startDate: ISO date string (required)
 *   endDate:   ISO date string (required)
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_accounting_reports')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    const startDate = new Date(startParam)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endParam)
    endDate.setHours(23, 59, 59, 999)

    const branchFilter =
      context!.branchesEnabled && context!.currentBranchId
        ? { branchId: context!.currentBranchId }
        : {}

    // Purchases by supplier
    const purchases = await prisma.purchase.findMany({
      where: {
        tenantId: context!.tenantId,
        ...branchFilter,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
      },
    })

    // Operating expenses (not linked to a supplier)
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId: context!.tenantId,
        ...branchFilter,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        amount: true,
        category: true,
        description: true,
      },
    })

    // Group purchases by supplier
    type VendorRow = {
      vendorId: string
      vendorName: string
      phone: string | null
      totalPurchases: number
      amountPaid: number
      amountOwing: number
      transactionCount: number
    }

    const vendorMap = new Map<string, VendorRow>()

    for (const p of purchases) {
      const key = p.supplierId
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          vendorId: p.supplier.id,
          vendorName: p.supplier.name,
          phone: p.supplier.phone ?? null,
          totalPurchases: 0,
          amountPaid: 0,
          amountOwing: 0,
          transactionCount: 0,
        })
      }
      const row = vendorMap.get(key)!
      row.totalPurchases = round2(row.totalPurchases + p.totalAmount)
      row.amountPaid = round2(row.amountPaid + p.paidAmount)
      row.amountOwing = round2(row.amountOwing + (p.totalAmount - p.paidAmount))
      row.transactionCount += 1
    }

    // Group operating expenses by category
    type ExpenseCategoryRow = {
      categoryKey: string
      categoryName: string
      totalAmount: number
      transactionCount: number
    }

    const expenseCategoryMap = new Map<string, ExpenseCategoryRow>()
    for (const e of expenses) {
      const key = e.category
      if (!expenseCategoryMap.has(key)) {
        expenseCategoryMap.set(key, {
          categoryKey: key,
          categoryName: key.replace(/_/g, ' '),
          totalAmount: 0,
          transactionCount: 0,
        })
      }
      const row = expenseCategoryMap.get(key)!
      row.totalAmount = round2(row.totalAmount + e.amount)
      row.transactionCount += 1
    }

    const supplierRows = Array.from(vendorMap.values()).sort(
      (a, b) => b.totalPurchases - a.totalPurchases
    )

    const expenseRows = Array.from(expenseCategoryMap.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    )

    const supplierTotals = {
      totalPurchases: round2(supplierRows.reduce((s, r) => s + r.totalPurchases, 0)),
      amountPaid: round2(supplierRows.reduce((s, r) => s + r.amountPaid, 0)),
      amountOwing: round2(supplierRows.reduce((s, r) => s + r.amountOwing, 0)),
      transactionCount: supplierRows.reduce((s, r) => s + r.transactionCount, 0),
    }

    const expenseTotals = {
      totalAmount: round2(expenseRows.reduce((s, r) => s + r.totalAmount, 0)),
      transactionCount: expenseRows.reduce((s, r) => s + r.transactionCount, 0),
    }

    const grandTotal = round2(supplierTotals.totalPurchases + expenseTotals.totalAmount)

    return NextResponse.json({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      supplierRows,
      supplierTotals,
      expenseRows,
      expenseTotals,
      grandTotal,
    })
  } catch (err) {
    console.error('Expense by Vendor report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
