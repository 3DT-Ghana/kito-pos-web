import { NextResponse } from 'next/server'
import { ItemType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'

/**
 * GET /api/pos/items
 * Fast item search for the POS terminal.
 * Returns a minimal projection for speed.
 *
 * Query params:
 *   q      - search string (name or barcode prefix match)
 *   limit  - max results (default 50)
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const manufacturerId = searchParams.get('manufacturerId')?.trim() ?? ''
    const categoryId = searchParams.get('categoryId')?.trim() ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

    const where = applyBranchScope({
      tenantId: context!.tenantId,
      OR: [
        { itemType: ItemType.INVENTORY, quantity: { gt: 0 } },
        { itemType: ItemType.NON_INVENTORY },
        { itemType: ItemType.SERVICE },
      ],
      ...(manufacturerId ? { manufacturerId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { barcode: { startsWith: q } },
            ],
          }
        : {}),
    }, context!)

    const items = await prisma.item.findMany({
      where,
      select: {
        id: true,
        name: true,
        barcode: true,
        itemType: true,
        sellingPrice: true,
        retailPrice: true,
        wholesalePrice: true,
        promoPrice: true,
        quantity: true,
        unitName: true,
        piecesPerUnit: true,
        branchId: true,
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: { name: 'asc' },
      take: limit,
    })

    // Return categories that have in-stock items for the POS tab bar
    const categories = await prisma.category.findMany({
      where: {
        tenantId: context!.tenantId,
        items: {
          some: applyBranchScope(
            {
              OR: [
                { itemType: ItemType.INVENTORY, quantity: { gt: 0 } },
                { itemType: ItemType.NON_INVENTORY },
                { itemType: ItemType.SERVICE },
              ],
            },
            context!
          ),
        },
      },
      select: { id: true, name: true, color: true, icon: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ items, categories })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
