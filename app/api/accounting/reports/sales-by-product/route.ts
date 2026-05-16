import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/sales-by-product
 * Sales summary grouped by product/item for a date range.
 *
 * Query params:
 *   startDate: ISO date string (required)
 *   endDate:   ISO date string (required)
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
    const startParam = searchParams.get('startDate')
    const endParam = searchParams.get('endDate')
    const categoryId = searchParams.get('categoryId')

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    const startDate = new Date(startParam)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endParam)
    endDate.setHours(23, 59, 59, 999)

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled && context!.currentBranchId
            ? { branchId: context!.currentBranchId }
            : {}),
          createdAt: { gte: startDate, lte: endDate },
          OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
        },
        ...(categoryId ? { item: { categoryId } } : {}),
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    })

    type ProductRow = {
      itemId: string
      itemName: string
      categoryId: string | null
      categoryName: string | null
      quantitySold: number
      revenue: number
      cogs: number
      grossProfit: number
      grossMarginPct: number
      avgSellingPrice: number
    }

    const productMap = new Map<string, ProductRow>()

    for (const li of saleItems) {
      const item = li.item
      const lineRevenue = round2(
        li.lineSubtotalAmount ?? (li.quantity * li.price - li.discountAmount)
      )
      const lineCOGS = round2(li.quantity * (item.costPrice ?? 0))

      if (!productMap.has(item.id)) {
        productMap.set(item.id, {
          itemId: item.id,
          itemName: item.name,
          categoryId: item.category?.id ?? null,
          categoryName: item.category?.name ?? null,
          quantitySold: 0,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          grossMarginPct: 0,
          avgSellingPrice: 0,
        })
      }

      const row = productMap.get(item.id)!
      row.quantitySold = round2(row.quantitySold + li.quantity)
      row.revenue = round2(row.revenue + lineRevenue)
      row.cogs = round2(row.cogs + lineCOGS)
    }

    const rows = Array.from(productMap.values()).map((r) => ({
      ...r,
      grossProfit: round2(r.revenue - r.cogs),
      grossMarginPct: r.revenue > 0 ? round2(((r.revenue - r.cogs) / r.revenue) * 100) : 0,
      avgSellingPrice: r.quantitySold > 0 ? round2(r.revenue / r.quantitySold) : 0,
    }))

    rows.sort((a, b) => b.revenue - a.revenue)

    const totals = {
      quantitySold: round2(rows.reduce((s, r) => s + r.quantitySold, 0)),
      revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
      cogs: round2(rows.reduce((s, r) => s + r.cogs, 0)),
      grossProfit: round2(rows.reduce((s, r) => s + r.grossProfit, 0)),
      grossMarginPct: 0,
    }
    totals.grossMarginPct =
      totals.revenue > 0 ? round2((totals.grossProfit / totals.revenue) * 100) : 0

    return NextResponse.json({ startDate: startDate.toISOString(), endDate: endDate.toISOString(), rows, totals })
  } catch (err) {
    console.error('Sales by Product report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
