import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { round2 } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/reports/statement-of-account
 * Per-customer statement: opening balance, sales (debits), payments (credits), closing balance.
 *
 * Query params:
 *   customerId: string (required)
 *   startDate, endDate: ISO strings (optional)
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
    const customerId = searchParams.get('customerId')
    const startDate  = searchParams.get('startDate')
    const endDate    = searchParams.get('endDate')

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: context!.tenantId },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }

    // Opening balance = all sales and payments before startDate
    let openingBalance = 0
    if (startDate) {
      const priorSales = await prisma.sale.findMany({
        where: {
          tenantId: context!.tenantId,
          customerId,
          paymentType: 'CREDIT',
          createdAt: { lt: new Date(startDate) },
          OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
        },
        select: { totalAmount: true, paidAmount: true },
      })
      const priorPayments = await prisma.customerPayment.findMany({
        where: {
          tenantId: context!.tenantId,
          customerId,
          createdAt: { lt: new Date(startDate) },
        },
        select: { amount: true },
      })
      const priorSaleTotal = priorSales.reduce((s, r) => s + r.totalAmount - r.paidAmount, 0)
      const priorPayTotal  = priorPayments.reduce((s, r) => s + r.amount, 0)
      openingBalance = round2(priorSaleTotal - priorPayTotal)
    }

    // Sales in period
    const sales = await prisma.sale.findMany({
      where: {
        tenantId: context!.tenantId,
        customerId,
        OR: [{ approvalStatus: null }, { approvalStatus: 'APPROVED' }],
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        paymentType: true,
        paymentMethod: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Payments in period
    const payments = await prisma.customerPayment.findMany({
      where: {
        tenantId: context!.tenantId,
        customerId,
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        amount: true,
        method: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Merge and sort by date
    type TxLine = {
      date: Date
      type: 'SALE' | 'PAYMENT' | 'RETURN'
      reference: string
      description: string
      debit: number    // amount owed (charge to customer)
      credit: number   // amount paid (payment from customer)
      balance: number
    }

    const lines: Omit<TxLine, 'balance'>[] = [
      ...sales.map(s => ({
        date: s.createdAt,
        type: 'SALE' as const,
        reference: s.id.slice(-8).toUpperCase(),
        description: s.paymentType === 'CREDIT'
          ? `Credit Sale (${s.paymentMethod})`
          : `Cash Sale (${s.paymentMethod})`,
        debit: round2(s.totalAmount - s.paidAmount),
        credit: s.paidAmount > 0 ? round2(s.paidAmount) : 0,
      })),
      ...payments.map(p => ({
        date: p.createdAt,
        type: 'PAYMENT' as const,
        reference: p.id.slice(-8).toUpperCase(),
        description: `Payment received (${p.method})`,
        debit: 0,
        credit: p.amount,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Apply running balance
    let balance = openingBalance
    const rows: TxLine[] = lines.map(line => {
      balance = round2(balance + line.debit - line.credit)
      return { ...line, balance }
    })

    const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance
    const totalDebits    = round2(rows.reduce((s, r) => s + r.debit,  0))
    const totalCredits   = round2(rows.reduce((s, r) => s + r.credit, 0))

    return NextResponse.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      period: { startDate, endDate },
      openingBalance,
      rows,
      totals: { totalDebits, totalCredits },
      closingBalance,
    })
  } catch (err) {
    console.error('Statement of account error:', err)
    return NextResponse.json({ error: 'Failed to generate statement of account' }, { status: 500 })
  }
}
