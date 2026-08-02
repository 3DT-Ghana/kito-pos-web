import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, type BranchAccessContext } from '@/lib/branch/server'

export async function getItemsCatalogData(context: BranchAccessContext) {
  const [items, categories] = await Promise.all([
    prisma.item.findMany({
      where: applyBranchScope({ tenantId: context.tenantId }, context),
      select: {
        id: true,
        name: true,
        barcode: true,
        quantity: true,
        reorderLevel: true,
        costPrice: true,
        sellingPrice: true,
        expiryDate: true,
        itemType: true,
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { tenantId: context.tenantId },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  return {
    items: items.map((item) => ({
      ...item,
      expiryDate: item.expiryDate?.toISOString() ?? null,
    })),
    categories,
  }
}
