import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, isBranchFilterActive, type BranchAccessContext } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'

export interface ScopedCounterpartyMetric {
  transactionCount: number
  totalAmount: number
  totalPaid: number
  totalPayments: number
  balance: number
  hasActivity: boolean
}

function createEmptyMetric(): ScopedCounterpartyMetric {
  return {
    transactionCount: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalPayments: 0,
    balance: 0,
    hasActivity: false,
  }
}

function finalizeMetric(metric: ScopedCounterpartyMetric) {
  metric.balance = Math.max(0, metric.totalAmount - metric.totalPaid - metric.totalPayments)
  metric.hasActivity = metric.transactionCount > 0 || metric.totalPayments > 0
  return metric
}

export async function getScopedCustomerMetrics(
  context: BranchAccessContext,
  customerIds: string[]
) {
  const uniqueCustomerIds = Array.from(new Set(customerIds.filter(Boolean)))
  const metrics = new Map<string, ScopedCounterpartyMetric>()

  if (uniqueCustomerIds.length === 0) {
    return metrics
  }

  const [sales, payments, creditReturns] = await Promise.all([
    prisma.sale.groupBy({
      by: ['customerId'],
      where: approvedSaleWhere(
        applyBranchScope(
          {
            tenantId: context.tenantId,
            customerId: { in: uniqueCustomerIds },
          },
          context
        )
      ),
      _count: { _all: true },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.customerPayment.groupBy({
      by: ['customerId'],
      where: applyBranchScope(
        {
          tenantId: context.tenantId,
          customerId: { in: uniqueCustomerIds },
        },
        context
      ),
      _sum: { amount: true },
    }),
    prisma.customerReturn.findMany({
      where: {
        tenantId: context.tenantId,
        type: 'CREDIT',
        sale: approvedSaleWhere({
          customerId: { in: uniqueCustomerIds },
          ...(isBranchFilterActive(context) ? { branchId: context.currentBranchId } : {}),
        }),
      },
      select: {
        amount: true,
        sale: { select: { customerId: true } },
      },
    }),
  ])

  for (const sale of sales) {
    if (!sale.customerId) continue

    metrics.set(
      sale.customerId,
      finalizeMetric({
        transactionCount: sale._count._all,
        totalAmount: sale._sum.totalAmount ?? 0,
        totalPaid: sale._sum.paidAmount ?? 0,
        totalPayments: 0,
        balance: 0,
        hasActivity: true,
      })
    )
  }

  for (const payment of payments) {
    const metric = metrics.get(payment.customerId) ?? createEmptyMetric()
    metric.totalPayments += payment._sum.amount ?? 0
    metrics.set(payment.customerId, finalizeMetric(metric))
  }

  for (const customerReturn of creditReturns) {
    const customerId = customerReturn.sale.customerId
    if (!customerId) continue

    const metric = metrics.get(customerId) ?? createEmptyMetric()
    metric.totalPayments += customerReturn.amount
    metrics.set(customerId, finalizeMetric(metric))
  }

  return metrics
}

export async function getScopedSupplierMetrics(
  context: BranchAccessContext,
  supplierIds: string[]
) {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)))
  const metrics = new Map<string, ScopedCounterpartyMetric>()

  if (uniqueSupplierIds.length === 0) {
    return metrics
  }

  const [purchases, payments, creditReturns] = await Promise.all([
    prisma.purchase.groupBy({
      by: ['supplierId'],
      where: applyBranchScope(
        {
          tenantId: context.tenantId,
          supplierId: { in: uniqueSupplierIds },
        },
        context
      ),
      _count: { _all: true },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ['supplierId'],
      where: applyBranchScope(
        {
          tenantId: context.tenantId,
          supplierId: { in: uniqueSupplierIds },
        },
        context
      ),
      _sum: { amount: true },
    }),
    prisma.supplierReturn.findMany({
      where: {
        tenantId: context.tenantId,
        type: 'CREDIT',
        purchase: {
          supplierId: { in: uniqueSupplierIds },
          ...(isBranchFilterActive(context) ? { branchId: context.currentBranchId } : {}),
        },
      },
      select: {
        amount: true,
        purchase: { select: { supplierId: true } },
      },
    }),
  ])

  for (const purchase of purchases) {
    if (!purchase.supplierId) continue

    metrics.set(
      purchase.supplierId,
      finalizeMetric({
        transactionCount: purchase._count._all,
        totalAmount: purchase._sum.totalAmount ?? 0,
        totalPaid: purchase._sum.paidAmount ?? 0,
        totalPayments: 0,
        balance: 0,
        hasActivity: true,
      })
    )
  }

  for (const payment of payments) {
    const metric = metrics.get(payment.supplierId) ?? createEmptyMetric()
    metric.totalPayments += payment._sum.amount ?? 0
    metrics.set(payment.supplierId, finalizeMetric(metric))
  }

  for (const supplierReturn of creditReturns) {
    const supplierId = supplierReturn.purchase.supplierId
    // Guarded to match the customer path above — without it a return against a
    // supplier-less purchase writes a null key into the metrics map.
    if (!supplierId) continue
    const metric = metrics.get(supplierId) ?? createEmptyMetric()
    metric.totalPayments += supplierReturn.amount
    metrics.set(supplierId, finalizeMetric(metric))
  }

  return metrics
}
