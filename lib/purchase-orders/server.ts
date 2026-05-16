import type { BranchAccessContext } from '@/lib/branch/server'
import { isBranchFilterActive } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'

interface PurchaseOrderBranchSnapshot {
  id: string
  branchId?: string | null
  items: Array<{ itemId: string }>
}

export async function getVisiblePurchaseOrderIds(
  context: BranchAccessContext,
  orders: PurchaseOrderBranchSnapshot[]
) {
  const allIds = new Set(orders.map((order) => order.id))

  if (!isBranchFilterActive(context)) {
    return allIds
  }

  if (!context.currentBranchId) {
    return new Set<string>()
  }

  const visibleIds = new Set<string>()
  const unresolvedOrders: PurchaseOrderBranchSnapshot[] = []

  for (const order of orders) {
    if (order.branchId) {
      if (order.branchId === context.currentBranchId) {
        visibleIds.add(order.id)
      }
      continue
    }

    unresolvedOrders.push(order)
  }

  if (unresolvedOrders.length === 0) {
    return visibleIds
  }

  const itemIds = Array.from(
    new Set(
      unresolvedOrders.flatMap((order) =>
        order.items.map((item) => item.itemId).filter(Boolean)
      )
    )
  )

  if (itemIds.length === 0) {
    return visibleIds
  }

  const items = await prisma.item.findMany({
    where: {
      tenantId: context.tenantId,
      id: { in: itemIds },
    },
    select: {
      id: true,
      branchId: true,
    },
  })

  const itemBranchMap = new Map(items.map((item) => [item.id, item.branchId]))

  for (const order of unresolvedOrders) {
    if (order.items.length === 0) {
      continue
    }

    const isVisible = order.items.every(
      (item) => itemBranchMap.get(item.itemId) === context.currentBranchId
    )

    if (isVisible) {
      visibleIds.add(order.id)
    }
  }

  return visibleIds
}
