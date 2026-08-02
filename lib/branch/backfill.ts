import { prisma } from '@/lib/db/prisma'

/**
 * Assign every branch-less row to the tenant's default branch.
 *
 * Branch scoping is strict equality (`applyBranchScope` emits
 * `branchId: <uuid>`), so a row with `branchId: null` matches no branch. Every
 * row written while `enableBranches` was false has exactly that — and since
 * the flag defaults to false, that is the normal history of any tenant that
 * later adopts branches.
 *
 * Without this backfill, enabling branches makes the entire past disappear
 * from every list, report and metric. Only OWNER and STORE_MANAGER can select
 * "All Branches" to see it again; for a CASHIER or BRANCH_MANAGER the data is
 * simply gone.
 *
 * Idempotent: it only ever touches rows where `branchId` IS NULL, so running
 * it twice is a no-op. Returns the per-model counts so the caller can report
 * what moved.
 */
export async function backfillNullBranchRows(tenantId: string): Promise<{
  branchId: string | null
  branchName: string | null
  moved: Record<string, number>
  total: number
}> {
  // Prefer the explicit default; fall back to the oldest branch, matching the
  // fallback that requireBranchAccess itself uses.
  const branch =
    (await prisma.branch.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true, name: true },
    })) ??
    (await prisma.branch.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    }))

  if (!branch) {
    return { branchId: null, branchName: null, moved: {}, total: 0 }
  }

  const where = { tenantId, branchId: null }
  const data = { branchId: branch.id }

  // One transaction so a partial backfill cannot leave some models tagged and
  // others stranded.
  const [
    items,
    sales,
    purchases,
    expenses,
    customerPayments,
    supplierPayments,
    stockAdjustments,
    cashRegisters,
    quotations,
    purchaseOrders,
    waybills,
  ] = await prisma.$transaction([
    prisma.item.updateMany({ where, data }),
    prisma.sale.updateMany({ where, data }),
    prisma.purchase.updateMany({ where, data }),
    prisma.expense.updateMany({ where, data }),
    prisma.customerPayment.updateMany({ where, data }),
    prisma.supplierPayment.updateMany({ where, data }),
    prisma.stockAdjustment.updateMany({ where, data }),
    prisma.cashRegister.updateMany({ where, data }),
    prisma.quotation.updateMany({ where, data }),
    prisma.purchaseOrder.updateMany({ where, data }),
    prisma.waybill.updateMany({ where, data }),
  ])

  const moved: Record<string, number> = {
    items: items.count,
    sales: sales.count,
    purchases: purchases.count,
    expenses: expenses.count,
    customerPayments: customerPayments.count,
    supplierPayments: supplierPayments.count,
    stockAdjustments: stockAdjustments.count,
    cashRegisters: cashRegisters.count,
    quotations: quotations.count,
    purchaseOrders: purchaseOrders.count,
    waybills: waybills.count,
  }

  return {
    branchId: branch.id,
    branchName: branch.name,
    moved,
    total: Object.values(moved).reduce((sum, n) => sum + n, 0),
  }
}
