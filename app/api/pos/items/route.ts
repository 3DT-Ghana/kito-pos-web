import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { prisma } from '@/lib/db/prisma'

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
    const { error, tenantId } = await requireTenant()
    if (error) return error!

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

    const where = {
      tenantId: tenantId!,
      quantity: { gt: 0 },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { barcode: { startsWith: q } },
            ],
          }
        : {}),
    }

    const items = await prisma.item.findMany({
      where,
      select: {
        id: true,
        name: true,
        barcode: true,
        sellingPrice: true,
        retailPrice: true,
        wholesalePrice: true,
        promoPrice: true,
        quantity: true,
        unitName: true,
        piecesPerUnit: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    })

    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
