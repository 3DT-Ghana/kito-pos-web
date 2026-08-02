import { NextResponse } from 'next/server'
import { ItemType, TaxCalculationType } from '@prisma/client'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import { normalizeItemType } from '@/lib/items/type'
import { isLowStock, normalizeReorderLevel } from '@/lib/items/stock'
import { syncProductTaxSetting, hasProductTaxSettingPayload } from '@/lib/tax/products'
import { itemTaxSettingInclude } from '@/lib/tax/server'

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
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_items')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const manufacturerId = searchParams.get('manufacturerId')
    const categoryId = searchParams.get('categoryId')
    const lowStock = searchParams.get('lowStock') === 'true'
    const unitNamesOnly = searchParams.get('unitNames') === 'true'

    // Return distinct unit names used by tenant's items
    if (unitNamesOnly) {
      const rows = await prisma.item.findMany({
        where: applyBranchScope({ tenantId: context!.tenantId, unitName: { not: null } }, context!),
        select: { unitName: true },
        distinct: ['unitName'],
        orderBy: { unitName: 'asc' },
      })
      return NextResponse.json(rows.map(r => r.unitName).filter(Boolean))
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = applyBranchScope({ tenantId: context!.tenantId }, context!)

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { barcode: { contains: search, mode: 'insensitive' as const } },
      ]
    }

    if (manufacturerId) {
      where.manufacturerId = manufacturerId
    }

    if (categoryId) {
      where.categoryId = categoryId === 'uncategorized' ? null : categoryId
    }

    if (lowStock) {
      where.itemType = ItemType.INVENTORY
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
        ...itemTaxSettingInclude,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(
      lowStock
        ? items.filter(item => isLowStock(item.quantity, item.reorderLevel))
        : items
    )
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
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'create_items')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before creating inventory items.'
    )
    if (branchError) return branchError

    const body = await req.json()

    // Validate required fields
    const validationError = validateItemData(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Resolve manufacturer: use provided ID or fall back to "System" manufacturer
    let resolvedManufacturerId: string = body.manufacturerId
    if (!resolvedManufacturerId) {
      let systemMfr = await prisma.manufacturer.findFirst({
        where: { tenantId: context!.tenantId, name: { equals: 'System', mode: 'insensitive' } },
      })
      if (!systemMfr) {
        systemMfr = await prisma.manufacturer.create({
          data: { tenantId: context!.tenantId, name: 'System' },
        })
      }
      resolvedManufacturerId = systemMfr.id
    }

    // Verify manufacturer belongs to tenant
    const manufacturer = await prisma.manufacturer.findFirst({
      where: {
        id: resolvedManufacturerId,
        tenantId: context!.tenantId,
      },
    })

    if (!manufacturer) {
      return NextResponse.json(
        { error: 'Brand / Manufacturer not found or does not belong to your tenant' },
        { status: 404 }
      )
    }

    // Check for duplicate: same name + same manufacturer within tenant
    const existing = await prisma.item.findFirst({
      where: {
        tenantId: context!.tenantId,
        manufacturerId: resolvedManufacturerId,
        ...(context!.branchesEnabled ? { branchId } : {}),
        name: {
          equals: body.name.trim(),
          mode: 'insensitive' as const,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'An item with this name already exists for this brand / manufacturer' },
        { status: 409 }
      )
    }

    // Barcodes have no unique constraint, so a duplicate makes POS scanning
    // ambiguous — whichever item sorts first gets sold and decremented.
    if (body.barcode) {
      const barcodeValue = String(body.barcode).trim()
      if (barcodeValue) {
        const barcodeClash = await prisma.item.findFirst({
          where: { tenantId: context!.tenantId, barcode: barcodeValue },
          select: { name: true },
        })
        if (barcodeClash) {
          return NextResponse.json(
            { error: `Barcode "${barcodeValue}" is already used by "${barcodeClash.name}".` },
            { status: 409 }
          )
        }
      }
    }

    // Create item
    const item = await prisma.$transaction(async (tx) => {
      const createdItem = await tx.item.create({
        data: {
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
          manufacturerId: resolvedManufacturerId,
          name: body.name.trim(),
          quantity: parseFloat(body.quantity) || 0,
          ...(body.reorderLevel !== undefined && body.reorderLevel !== null
            ? { reorderLevel: normalizeReorderLevel(Number(body.reorderLevel)) }
            : {}),
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
          // Accounting fields
          ...(body.itemType && { itemType: body.itemType }),
          ...(body.incomeAccountId  ? { incomeAccountId:  body.incomeAccountId  } : {}),
          ...(body.cogsAccountId    ? { cogsAccountId:    body.cogsAccountId    } : {}),
          ...(body.expenseAccountId ? { expenseAccountId: body.expenseAccountId } : {}),
        },
      })

      if (hasProductTaxSettingPayload(body as Record<string, unknown>)) {
        await syncProductTaxSetting({
          tx,
          tenantId: context!.tenantId,
          productId: createdItem.id,
          input: {
            isTaxable: Boolean(body.isTaxable),
            taxRateId: body.taxRateId || null,
            taxRateIds: Array.isArray(body.taxRateIds) ? body.taxRateIds : null,
            taxCalculationType: body.taxCalculationType ?? null,
            useTenantDefaultTaxes: body.useTenantDefaultTaxes !== false,
          },
        })
      }

      return tx.item.findUniqueOrThrow({
        where: { id: createdItem.id },
        include: {
          manufacturer: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true, icon: true } },
          ...itemTaxSettingInclude,
        },
      })
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

  if (data.quantity !== undefined && (isNaN(data.quantity) || data.quantity < 0)) {
    return 'Quantity must be a non-negative number'
  }

  if (
    data.reorderLevel !== undefined &&
    data.reorderLevel !== null &&
    (!Number.isInteger(Number(data.reorderLevel)) || Number(data.reorderLevel) < 0)
  ) {
    return 'Reorder level must be a non-negative whole number'
  }

  if (data.costPrice === undefined || data.costPrice === null || isNaN(parseFloat(data.costPrice)) || parseFloat(data.costPrice) < 0) {
    return 'Cost price must be a non-negative number'
  }

  if (data.sellingPrice === undefined || data.sellingPrice === null || isNaN(parseFloat(data.sellingPrice)) || parseFloat(data.sellingPrice) < 0) {
    return 'Selling price must be a non-negative number'
  }

  if (parseFloat(data.sellingPrice) < parseFloat(data.costPrice)) {
    return 'Selling price should not be less than cost price'
  }

  if (data.itemType !== undefined && normalizeItemType(data.itemType) !== data.itemType) {
    return 'Invalid item type'
  }

  if (
    data.taxCalculationType !== undefined &&
    !Object.values(TaxCalculationType).includes(data.taxCalculationType)
  ) {
    return 'Invalid tax calculation type'
  }

  if (
    data.taxRateIds !== undefined &&
    (!Array.isArray(data.taxRateIds) ||
      data.taxRateIds.some((taxRateId: unknown) => typeof taxRateId !== 'string'))
  ) {
    return 'Tax rate selections must be valid IDs'
  }

  return null
}
