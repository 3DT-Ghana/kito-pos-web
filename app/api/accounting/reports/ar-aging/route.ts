import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/ar-aging
 * Accounts Receivable Aging — outstanding customer balances bucketed by days overdue.
 * Uses the Sale records (paidAmount < totalAmount = credit outstanding).
 * Buckets: Current (not yet due / 0-30), 31-60, 61-90, 90+
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

    // Load all credit sales with outstanding balance, filtered by branchScope
    const sales = await prisma.sale.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && context!.currentBranchId
          ? { branchId: context!.currentBranchId }
          : {}),
        paymentType: 'CREDIT',
        // Only APPROVED or null (auto-approved) sales
        OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
      },
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        customerId: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Also include customer payments to get accurate outstanding balance
    const payments = await prisma.customerPayment.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled && context!.currentBranchId
          ? { branchId: context!.currentBranchId }
          : {}),
      },
      select: { customerId: true, amount: true, createdAt: true },
    })

    // Build payment totals by customer up to asOf
    const paymentByCustomer = new Map<string, number>()
    for (const p of payments) {
      if (new Date(p.createdAt) <= asOf) {
        paymentByCustomer.set(
          p.customerId,
          round2((paymentByCustomer.get(p.customerId) ?? 0) + p.amount)
        )
      }
    }

    // Per customer, compute outstanding from sales created before asOf
    type CustomerRow = {
      customerId: string
      customerName: string
      phone: string | null
      current: number   // 0-30 days
      days31_60: number
      days61_90: number
      over90: number
      total: number
      oldestInvoiceDate: string
    }

    const customerMap = new Map<string, CustomerRow>()

    for (const sale of sales) {
      if (new Date(sale.createdAt) > asOf) continue
      const outstanding = round2(sale.totalAmount - sale.paidAmount)
      if (outstanding <= 0.001) continue

      const cust = sale.customer
      if (!cust) continue

      const daysOld = Math.floor(
        (asOf.getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )

      if (!customerMap.has(cust.id)) {
        customerMap.set(cust.id, {
          customerId: cust.id,
          customerName: cust.name,
          phone: cust.phone,
          current: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 0,
          total: 0,
          oldestInvoiceDate: sale.createdAt.toISOString(),
        })
      }

      const row = customerMap.get(cust.id)!

      if (daysOld <= 30) row.current = round2(row.current + outstanding)
      else if (daysOld <= 60) row.days31_60 = round2(row.days31_60 + outstanding)
      else if (daysOld <= 90) row.days61_90 = round2(row.days61_90 + outstanding)
      else row.over90 = round2(row.over90 + outstanding)

      row.total = round2(row.total + outstanding)

      if (new Date(sale.createdAt) < new Date(row.oldestInvoiceDate)) {
        row.oldestInvoiceDate = sale.createdAt.toISOString()
      }
    }

    const rows = Array.from(customerMap.values())
      .filter(r => r.total > 0.001)
      .sort((a, b) => b.total - a.total)

    const totals = {
      current:  round2(rows.reduce((s, r) => s + r.current,   0)),
      days31_60: round2(rows.reduce((s, r) => s + r.days31_60, 0)),
      days61_90: round2(rows.reduce((s, r) => s + r.days61_90, 0)),
      over90:   round2(rows.reduce((s, r) => s + r.over90,    0)),
      total:    round2(rows.reduce((s, r) => s + r.total,     0)),
    }

    return NextResponse.json({ asOf: asOf.toISOString(), rows, totals })
  } catch (err) {
    console.error('AR Aging report error:', err)
    return NextResponse.json({ error: 'Failed to generate AR aging report' }, { status: 500 })
  }
}
