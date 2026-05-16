import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/ap-aging
 * Accounts Payable Aging — outstanding supplier payables bucketed by days overdue.
 * Uses Purchase records (paidAmount < totalAmount = credit payable).
 * Buckets: Current (0-30), 31-60, 61-90, 90+
 *
 * Query params:
 *   asOf: ISO date string (defaults to today)
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
    const asOfParam = searchParams.get('asOf')
    const asOf = asOfParam ? new Date(asOfParam) : new Date()
    asOf.setHours(23, 59, 59, 999)

    const purchases = await prisma.purchase.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && context!.currentBranchId
          ? { branchId: context!.currentBranchId }
          : {}),
        paymentType: 'CREDIT',
      },
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        supplierId: true,
        supplier: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    type SupplierRow = {
      supplierId: string
      supplierName: string
      phone: string | null
      current: number
      days31_60: number
      days61_90: number
      over90: number
      total: number
      oldestInvoiceDate: string
    }

    const supplierMap = new Map<string, SupplierRow>()

    for (const purchase of purchases) {
      if (new Date(purchase.createdAt) > asOf) continue
      const outstanding = round2(purchase.totalAmount - purchase.paidAmount)
      if (outstanding <= 0.001) continue

      const sup = purchase.supplier
      const daysOld = Math.floor(
        (asOf.getTime() - new Date(purchase.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )

      if (!supplierMap.has(sup.id)) {
        supplierMap.set(sup.id, {
          supplierId: sup.id,
          supplierName: sup.name,
          phone: sup.phone,
          current: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 0,
          total: 0,
          oldestInvoiceDate: purchase.createdAt.toISOString(),
        })
      }

      const row = supplierMap.get(sup.id)!

      if (daysOld <= 30) row.current = round2(row.current + outstanding)
      else if (daysOld <= 60) row.days31_60 = round2(row.days31_60 + outstanding)
      else if (daysOld <= 90) row.days61_90 = round2(row.days61_90 + outstanding)
      else row.over90 = round2(row.over90 + outstanding)

      row.total = round2(row.total + outstanding)

      if (new Date(purchase.createdAt) < new Date(row.oldestInvoiceDate)) {
        row.oldestInvoiceDate = purchase.createdAt.toISOString()
      }
    }

    const rows = Array.from(supplierMap.values())
      .filter(r => r.total > 0.001)
      .sort((a, b) => b.total - a.total)

    const totals = {
      current:   round2(rows.reduce((s, r) => s + r.current,   0)),
      days31_60: round2(rows.reduce((s, r) => s + r.days31_60, 0)),
      days61_90: round2(rows.reduce((s, r) => s + r.days61_90, 0)),
      over90:    round2(rows.reduce((s, r) => s + r.over90,    0)),
      total:     round2(rows.reduce((s, r) => s + r.total,     0)),
    }

    return NextResponse.json({ asOf: asOf.toISOString(), rows, totals })
  } catch (err) {
    console.error('AP Aging report error:', err)
    return NextResponse.json({ error: 'Failed to generate AP aging report' }, { status: 500 })
  }
}
