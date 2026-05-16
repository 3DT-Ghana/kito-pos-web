import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/inventory-valuation
 * Current inventory value using average cost method (cost price × quantity on hand).
 *
 * Query params:
 *   categoryId?: filter to one category
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
    const categoryId = searchParams.get('categoryId')

    const items = await prisma.item.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && context!.currentBranchId
          ? { branchId: context!.currentBranchId }
          : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        costPrice: true,
        sellingPrice: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
        barcode: true,
        expiryDate: true,
      },
      orderBy: { name: 'asc' },
    })

    type ItemRow = {
      itemId: string
      itemName: string
      categoryId: string | null
      categoryName: string | null
      manufacturerName: string
      barcode: string | null
      quantityOnHand: number
      costPrice: number
      sellingPrice: number
      totalCostValue: number
      totalRetailValue: number
      potentialProfit: number
      expiryDate: string | null
      status: 'NORMAL' | 'LOW' | 'OUT_OF_STOCK' | 'EXPIRED'
    }

    const now = new Date()

    const rows: ItemRow[] = items.map((item) => {
      const qty = item.quantity ?? 0
      const totalCostValue = round2(qty * item.costPrice)
      const totalRetailValue = round2(qty * item.sellingPrice)
      const potentialProfit = round2(totalRetailValue - totalCostValue)

      let status: ItemRow['status'] = 'NORMAL'
      if (item.expiryDate && new Date(item.expiryDate) < now) {
        status = 'EXPIRED'
      } else if (qty <= 0) {
        status = 'OUT_OF_STOCK'
      } else if (qty <= 5) {
        status = 'LOW'
      }

      return {
        itemId: item.id,
        itemName: item.name,
        categoryId: item.categoryId ?? null,
        categoryName: item.category?.name ?? null,
        manufacturerName: item.manufacturer.name,
        barcode: item.barcode ?? null,
        quantityOnHand: qty,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
        status,
      }
    })

    // Group by category for summary
    type CategorySummary = {
      categoryId: string | null
      categoryName: string
      itemCount: number
      totalCostValue: number
      totalRetailValue: number
    }

    const categoryMap = new Map<string, CategorySummary>()
    for (const row of rows) {
      const key = row.categoryId ?? '__uncategorized__'
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          categoryId: row.categoryId,
          categoryName: row.categoryName ?? 'Uncategorized',
          itemCount: 0,
          totalCostValue: 0,
          totalRetailValue: 0,
        })
      }
      const cat = categoryMap.get(key)!
      cat.itemCount += 1
      cat.totalCostValue = round2(cat.totalCostValue + row.totalCostValue)
      cat.totalRetailValue = round2(cat.totalRetailValue + row.totalRetailValue)
    }

    const categorySummary = Array.from(categoryMap.values()).sort(
      (a, b) => b.totalCostValue - a.totalCostValue
    )

    const totals = {
      itemCount: rows.length,
      totalQuantity: round2(rows.reduce((s, r) => s + r.quantityOnHand, 0)),
      totalCostValue: round2(rows.reduce((s, r) => s + r.totalCostValue, 0)),
      totalRetailValue: round2(rows.reduce((s, r) => s + r.totalRetailValue, 0)),
      potentialProfit: round2(rows.reduce((s, r) => s + r.potentialProfit, 0)),
      outOfStockCount: rows.filter((r) => r.status === 'OUT_OF_STOCK').length,
      lowStockCount: rows.filter((r) => r.status === 'LOW').length,
      expiredCount: rows.filter((r) => r.status === 'EXPIRED').length,
    }

    return NextResponse.json({
      asOf: new Date().toISOString(),
      rows,
      categorySummary,
      totals,
    })
  } catch (err) {
    console.error('Inventory Valuation report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
