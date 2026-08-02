import { NextResponse } from 'next/server'
import { ItemType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'

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

    const featureError = requireTenantFeature(context!.features, 'enablePosTerminal')
    if (featureError) return featureError

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const manufacturerId = searchParams.get('manufacturerId')?.trim() ?? ''
    const categoryId = searchParams.get('categoryId')?.trim() ?? ''
    // Cap raised from 200 — a mid-size catalogue was silently truncated to the
    // alphabetically-first 200 items, hiding the rest from the POS grid entirely.
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 2000)

    const stockFilter = [
      { itemType: ItemType.INVENTORY, quantity: { gt: 0 } },
      { itemType: ItemType.NON_INVENTORY },
      { itemType: ItemType.SERVICE },
    ]

    const searchFilter = q
      ? [
          { name: { contains: q, mode: 'insensitive' as const } },
          { barcode: { contains: q, mode: 'insensitive' as const } },
        ]
      : null

    // Combine stock-type filter and optional search filter with AND so both must apply
    const andClauses = searchFilter
      ? [{ OR: stockFilter }, { OR: searchFilter }]
      : [{ OR: stockFilter }]

    const where = applyBranchScope({
      tenantId: context!.tenantId,
      AND: andClauses,
      ...(manufacturerId ? { manufacturerId } : {}),
      ...(categoryId ? { categoryId } : {}),
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
        reorderLevel: true,
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
