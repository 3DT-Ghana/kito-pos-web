import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/sales-by-customer
 * Sales summary grouped by customer for a date range.
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

    const sales = await prisma.sale.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && context!.currentBranchId
          ? { branchId: context!.currentBranchId }
          : {}),
        createdAt: { gte: startDate, lte: endDate },
        OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            item: { select: { costPrice: true } },
          },
        },
      },
    })

    type CustomerRow = {
      customerId: string | null
      customerName: string
      phone: string | null
      totalSales: number
      totalCOGS: number
      grossProfit: number
      grossMarginPct: number
      amountPaid: number
      amountOwing: number
      transactionCount: number
    }

    const customerMap = new Map<string, CustomerRow>()

    for (const sale of sales) {
      const key = sale.customerId ?? '__walk_in__'
      const customerName = sale.customer?.name ?? 'Walk-in Customer'

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: sale.customerId,
          customerName,
          phone: sale.customer?.phone ?? null,
          totalSales: 0,
          totalCOGS: 0,
          grossProfit: 0,
          grossMarginPct: 0,
          amountPaid: 0,
          amountOwing: 0,
          transactionCount: 0,
        })
      }

      const row = customerMap.get(key)!

      const lineCOGS = sale.items.reduce(
        (sum: number, li) => sum + li.quantity * (li.item?.costPrice ?? 0),
        0
      )

      row.totalSales = round2(row.totalSales + sale.totalAmount)
      row.totalCOGS = round2(row.totalCOGS + lineCOGS)
      row.amountPaid = round2(row.amountPaid + sale.paidAmount)
      row.amountOwing = round2(row.amountOwing + (sale.totalAmount - sale.paidAmount))
      row.transactionCount += 1
    }

    const rows = Array.from(customerMap.values()).map((r) => ({
      ...r,
      grossProfit: round2(r.totalSales - r.totalCOGS),
      grossMarginPct:
        r.totalSales > 0 ? round2(((r.totalSales - r.totalCOGS) / r.totalSales) * 100) : 0,
    }))

    rows.sort((a, b) => b.totalSales - a.totalSales)

    const totalSales = round2(rows.reduce((s, r) => s + r.totalSales, 0))
    const totalCOGS = round2(rows.reduce((s, r) => s + r.totalCOGS, 0))
    const grossProfit = round2(totalSales - totalCOGS)
    const totals = {
      totalSales,
      totalCOGS,
      grossProfit,
      grossMarginPct: totalSales > 0 ? round2((grossProfit / totalSales) * 100) : 0,
      amountPaid: round2(rows.reduce((s, r) => s + r.amountPaid, 0)),
      amountOwing: round2(rows.reduce((s, r) => s + r.amountOwing, 0)),
      transactionCount: rows.reduce((s, r) => s + r.transactionCount, 0),
    }

    return NextResponse.json({ startDate: startDate.toISOString(), endDate: endDate.toISOString(), rows, totals })
  } catch (err) {
    console.error('Sales by Customer report error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
