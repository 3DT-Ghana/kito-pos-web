import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * Items API Routes
 *
 * GET /api/items - List all items for current tenant
 * POST /api/items - Create new item
 */

/**
 * GET /api/items
 * List all items for the current tenant
 * Optional query params: search, manufacturerId, lowStock
 */
export async function GET(req: Request) {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error!

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const manufacturerId = searchParams.get('manufacturerId')
    const categoryId = searchParams.get('categoryId')
    const lowStock = searchParams.get('lowStock') === 'true'
    const unitNamesOnly = searchParams.get('unitNames') === 'true'

    // Return distinct unit names used by tenant's items
    if (unitNamesOnly) {
      const rows = await prisma.item.findMany({
        where: { tenantId: tenantId!, unitName: { not: null } },
        select: { unitName: true },
        distinct: ['unitName'],
        orderBy: { unitName: 'asc' },
      })
      return NextResponse.json(rows.map(r => r.unitName).filter(Boolean))
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: tenantId! }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive' as const,
      }
    }

    if (manufacturerId) {
      where.manufacturerId = manufacturerId
    }

    if (categoryId) {
      where.categoryId = categoryId === 'uncategorized' ? null : categoryId
    }

    if (lowStock) {
      where.quantity = {
        lte: 10, // Low stock threshold
      }
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(items)
  } catch (err) {
    console.error('Failed to fetch items:', err)
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/items
 * Create a new item
 * Requires: create_items permission
 */
export async function POST(req: Request) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error!

    // Check permission
    const { authorized, error: permError } = requirePermission(
      user!.role,
      'create_items'
    )
    if (!authorized) return permError!

    const body = await req.json()

    // Validate required fields
    const validationError = validateItemData(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Verify manufacturer belongs to tenant
    const manufacturer = await prisma.manufacturer.findFirst({
      where: {
        id: body.manufacturerId,
        tenantId,
      },
    })

    if (!manufacturer) {
      return NextResponse.json(
        { error: 'Manufacturer not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    // Check for duplicate: same name + same manufacturer within tenant
    const existing = await prisma.item.findFirst({
      where: {
        tenantId,
        manufacturerId: body.manufacturerId,
        name: {
          equals: body.name.trim(),
          mode: 'insensitive' as const,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'An item with this name already exists for this manufacturer' },
        { status: 409 }
      )
    }

    // Create item
    const item = await prisma.item.create({
      data: {
        tenantId,
        manufacturerId: body.manufacturerId,
        name: body.name.trim(),
        quantity: parseFloat(body.quantity) || 0,
        costPrice: parseFloat(body.costPrice),
        sellingPrice: parseFloat(body.sellingPrice),
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.unitName !== undefined && { unitName: (body.unitName as string)?.trim() || 'unit' }),
        ...(body.piecesPerUnit !== undefined && { piecesPerUnit: parseInt(String(body.piecesPerUnit)) || 1 }),
        ...(body.retailPrice !== undefined && { retailPrice: body.retailPrice !== null ? parseFloat(body.retailPrice) : null }),
        ...(body.wholesalePrice !== undefined && { wholesalePrice: body.wholesalePrice !== null ? parseFloat(body.wholesalePrice) : null }),
        ...(body.promoPrice !== undefined && { promoPrice: body.promoPrice !== null ? parseFloat(body.promoPrice) : null }),
        ...(body.barcode !== undefined && { barcode: body.barcode ? String(body.barcode).trim() : null }),
        ...(body.expiryDate ? { expiryDate: new Date(body.expiryDate) } : {}),
      },
      include: {
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Failed to create item:', err)
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    )
  }
}

/**
 * Validate item data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateItemData(data: any): string | null {
  if (!data.name || typeof data.name !== 'string') {
    return 'Item name is required'
  }

  if (!data.manufacturerId || typeof data.manufacturerId !== 'string') {
    return 'Manufacturer ID is required'
  }

  if (data.quantity !== undefined && (isNaN(data.quantity) || data.quantity < 0)) {
    return 'Quantity must be a non-negative number'
  }

  if (!data.costPrice || isNaN(parseFloat(data.costPrice)) || parseFloat(data.costPrice) < 0) {
    return 'Cost price must be a positive number'
  }

  if (!data.sellingPrice || isNaN(parseFloat(data.sellingPrice)) || parseFloat(data.sellingPrice) < 0) {
    return 'Selling price must be a positive number'
  }

  if (parseFloat(data.sellingPrice) < parseFloat(data.costPrice)) {
    return 'Selling price should not be less than cost price'
  }

  return null
}
