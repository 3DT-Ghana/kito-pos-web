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

    // Standalone payments, credit notes and ledger transfers all reduce what a
    // customer owes but never touch Sale.paidAmount — they move Customer.balance
    // and post to the AR control account instead. Without applying them here,
    // AR aging, sum(Customer.balance) and trial-balance account 1100 were three
    // numbers that could never agree.
    //
    // (This map was previously built and then never read, so the correction the
    // comment promised never happened.)
    const [payments, creditReturns, transfers] = await Promise.all([
      prisma.customerPayment.findMany({
        where: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled && context!.currentBranchId
            ? { branchId: context!.currentBranchId }
            : {}),
          createdAt: { lte: asOf },
        },
        select: { customerId: true, amount: true },
      }),
      prisma.customerReturn.findMany({
        where: {
          tenantId: context!.tenantId,
          type: 'CREDIT',
          createdAt: { lte: asOf },
        },
        select: { amount: true, sale: { select: { customerId: true } } },
      }),
      prisma.ledgerTransfer.findMany({
        where: { tenantId: context!.tenantId, date: { lte: asOf } },
        select: {
          amount: true,
          debitCustomerId: true,
          creditCustomerId: true,
        },
      }),
    ])

    // Net credit applied against each customer's invoices
    const creditByCustomer = new Map<string, number>()
    const addCredit = (customerId: string | null | undefined, amount: number) => {
      if (!customerId) return
      creditByCustomer.set(customerId, round2((creditByCustomer.get(customerId) ?? 0) + amount))
    }
    for (const p of payments) addCredit(p.customerId, p.amount)
    for (const r of creditReturns) addCredit(r.sale?.customerId, r.amount)
    for (const t of transfers) {
      // A credit-side customer owes less; a debit-side customer owes more
      addCredit(t.creditCustomerId, t.amount)
      addCredit(t.debitCustomerId, -t.amount)
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

    // Remaining credit per customer, consumed oldest-invoice-first below.
    // `sales` is already ordered createdAt asc, so the natural iteration order
    // settles the oldest debt first — which is also what makes the buckets
    // meaningful rather than just the total.
    const unappliedCredit = new Map(creditByCustomer)

    for (const sale of sales) {
      if (new Date(sale.createdAt) > asOf) continue
      let outstanding = round2(sale.totalAmount - sale.paidAmount)
      if (outstanding <= 0.001) continue

      const cust = sale.customer
      if (!cust) continue

      const credit = unappliedCredit.get(cust.id) ?? 0
      if (credit > 0) {
        const applied = Math.min(credit, outstanding)
        outstanding = round2(outstanding - applied)
        unappliedCredit.set(cust.id, round2(credit - applied))
        if (outstanding <= 0.001) continue
      }

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
