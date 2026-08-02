import { NextResponse } from 'next/server'
import { TaxCalculationType } from '@prisma/client'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { applyBranchScope, requireBranchAccess } from '@/lib/branch/server'
import { approvedSaleWhere } from '@/lib/approvals/sales'
import { normalizeItemType } from '@/lib/items/type'
import { normalizeReorderLevel } from '@/lib/items/stock'
import { hasProductTaxSettingPayload, syncProductTaxSetting } from '@/lib/tax/products'
import { itemTaxSettingInclude } from '@/lib/tax/server'

/**
 * Item Detail API Routes
 *
 * GET /api/items/[id] - Get item by ID
 * PUT /api/items/[id] - Update item
 * DELETE /api/items/[id] - Delete item
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/items/[id]
 * Get a specific item with its transaction history
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_items')
    if (!authorized) return permError!

    const { id } = await params

    const item = await prisma.item.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        manufacturer: true,
        category: { select: { id: true, name: true, color: true, icon: true } },
        ...itemTaxSettingInclude,
        saleItems: {
          take: 10,
          where: {
            sale: approvedSaleWhere(),
          },
          orderBy: { sale: { createdAt: 'desc' } },
          include: {
            sale: {
              select: {
                id: true,
                createdAt: true,
                totalAmount: true,
              },
            },
          },
        },
        purchaseItems: {
          take: 10,
          orderBy: { purchase: { createdAt: 'desc' } },
          include: {
            purchase: {
              select: {
                id: true,
                createdAt: true,
                totalAmount: true,
              },
            },
          },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json(item)
  } catch (err) {
    console.error('Failed to fetch item:', err)
    return NextResponse.json(
      { error: 'Failed to fetch item' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/items/[id]
 * Update an item
 * Requires: update_items permission
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'update_items')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    // Check item exists and belongs to tenant
    const existing = await prisma.item.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
    })

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Validate data
    const validationError = validateItemData(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // If manufacturer is being changed, verify it belongs to tenant
    if (body.manufacturerId && body.manufacturerId !== existing.manufacturerId) {
      const manufacturer = await prisma.manufacturer.findFirst({
        where: {
          id: body.manufacturerId,
          tenantId: context!.tenantId,
        },
      })

      if (!manufacturer) {
        return NextResponse.json(
          { error: 'Manufacturer not found or does not belong to your tenant' },
          { status: 404 }
        )
      }
    }

    // Check for duplicate name (excluding current item)
    if (body.name && body.name !== existing.name) {
      const duplicateName = body.name.trim()
      const duplicateManufacturerId = body.manufacturerId ?? existing.manufacturerId
      const duplicate = await prisma.item.findFirst({
        where: {
          tenantId: context!.tenantId,
          manufacturerId: duplicateManufacturerId,
          ...(context!.branchesEnabled ? { branchId: existing.branchId ?? null } : {}),
          name: {
            equals: duplicateName,
            mode: 'insensitive' as const,
          },
          id: { not: id },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'An item with this name already exists for this manufacturer in the same branch' },
          { status: 409 }
        )
      }
    }

    // Changing an item away from INVENTORY while it still holds stock strands
    // that stock: every report filters the item out, so its value silently
    // disappears from the balance sheet with no journal entry — and it can
    // never be corrected, because stock adjustments reject non-inventory items.
    if (body.itemType !== undefined && body.itemType !== existing.itemType) {
      if (existing.itemType === 'INVENTORY' && existing.quantity !== 0) {
        return NextResponse.json(
          {
            error: `"${existing.name}" still has ${existing.quantity} in stock. Adjust the stock to zero before changing it to a ${body.itemType === 'SERVICE' ? 'service' : 'non-inventory'} item, otherwise that stock value would be lost with no record.`,
          },
          { status: 409 }
        )
      }
    }

    // Barcodes have no unique constraint, so a duplicate makes POS scanning
    // ambiguous — whichever item sorts first gets sold.
    if (body.barcode) {
      const barcodeValue = String(body.barcode).trim()
      if (barcodeValue) {
        const barcodeClash = await prisma.item.findFirst({
          where: { tenantId: context!.tenantId, barcode: barcodeValue, id: { not: id } },
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

    // Update item
    const item = await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name.trim() }),
          ...(body.manufacturerId && { manufacturerId: body.manufacturerId }),
          // quantity is deliberately NOT writable here. Editing it directly
          // bypassed the StockAdjustment audit row, the reason, and the
          // inventory GL journal — making the whole adjustment trail
          // meaningless when the unguarded path sat one click away in the same
          // form. All stock movement goes through processStockAdjustment.
          ...(body.reorderLevel !== undefined && body.reorderLevel !== null
            ? { reorderLevel: normalizeReorderLevel(Number(body.reorderLevel)) }
            : {}),
          ...(body.costPrice !== undefined && { costPrice: parseFloat(body.costPrice) }),
          ...(body.sellingPrice !== undefined && { sellingPrice: parseFloat(body.sellingPrice) }),
          ...(body.unitName !== undefined && { unitName: (body.unitName as string)?.trim() || 'unit' }),
          ...(body.piecesPerUnit !== undefined && { piecesPerUnit: parseInt(String(body.piecesPerUnit)) || 1 }),
          ...(body.retailPrice !== undefined && { retailPrice: body.retailPrice !== null ? parseFloat(body.retailPrice) : null }),
          ...(body.wholesalePrice !== undefined && { wholesalePrice: body.wholesalePrice !== null ? parseFloat(body.wholesalePrice) : null }),
          ...(body.promoPrice !== undefined && { promoPrice: body.promoPrice !== null ? parseFloat(body.promoPrice) : null }),
          ...(body.barcode !== undefined && { barcode: body.barcode ? String(body.barcode).trim() : null }),
          ...(body.expiryDate !== undefined && { expiryDate: body.expiryDate ? new Date(body.expiryDate) : null }),
          ...(body.categoryId !== undefined && { categoryId: body.categoryId || null }),
          // Accounting fields
          ...(body.itemType !== undefined && { itemType: body.itemType }),
          ...(body.incomeAccountId  !== undefined && { incomeAccountId:  body.incomeAccountId  || null }),
          ...(body.cogsAccountId    !== undefined && { cogsAccountId:    body.cogsAccountId    || null }),
          ...(body.expenseAccountId !== undefined && { expenseAccountId: body.expenseAccountId || null }),
        },
      })

      if (hasProductTaxSettingPayload(body as Record<string, unknown>)) {
        await syncProductTaxSetting({
          tx,
          tenantId: context!.tenantId,
          productId: id,
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
        where: { id },
        include: {
          manufacturer: true,
          category: { select: { id: true, name: true, color: true, icon: true } },
          ...itemTaxSettingInclude,
        },
      })
    })

    return NextResponse.json(item)
  } catch (err) {
    console.error('Failed to update item:', err)
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/items/[id]
 * Delete an item
 * Requires: delete_items permission
 * Note: Cannot delete if item has transaction history
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'delete_items')
    if (!authorized) return permError!

    const { id } = await params

    // Check item exists and belongs to tenant
    const item = await prisma.item.findFirst({
      where: applyBranchScope({ id, tenantId: context!.tenantId }, context!),
      include: {
        // All five relations, not just sales and purchases — returns and stock
        // adjustments also reference the item and have no cascade, so deleting
        // past them threw a raw FK error surfaced as a generic 500.
        _count: {
          select: {
            saleItems: true,
            purchaseItems: true,
            customerReturns: true,
            supplierReturns: true,
            stockAdjustments: true,
          },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Check if item has transaction history
    const historyCounts = [
      ['sales', item._count.saleItems],
      ['purchases', item._count.purchaseItems],
      ['customer returns', item._count.customerReturns],
      ['supplier returns', item._count.supplierReturns],
      ['stock adjustments', item._count.stockAdjustments],
    ] as const
    const blocking = historyCounts.filter(([, count]) => count > 0)

    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete "${item.name}" — it has ${blocking
            .map(([label, count]) => `${count} ${label}`)
            .join(', ')}. Deactivate it instead so reports stay intact.`,
          salesCount: item._count.saleItems,
          purchasesCount: item._count.purchaseItems,
        },
        { status: 409 }
      )
    }

    // Deleting an item that still holds stock silently writes off its value
    // with no journal entry and no record.
    if (item.itemType === 'INVENTORY' && item.quantity !== 0) {
      return NextResponse.json(
        {
          error: `"${item.name}" still has ${item.quantity} in stock. Adjust the stock to zero first so the write-off is recorded.`,
        },
        { status: 409 }
      )
    }

    // Delete item — scoped by tenant rather than trusting the earlier read
    await prisma.item.deleteMany({
      where: { id, tenantId: context!.tenantId },
    })

    return NextResponse.json(
      { message: 'Item deleted successfully' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to delete item:', err)
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    )
  }
}

/**
 * Validate item data for updates
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateItemData(data: any): string | null {
  if (data.name !== undefined && (!data.name || typeof data.name !== 'string')) {
    return 'Item name must be a non-empty string'
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

  if (data.costPrice !== undefined) {
    const price = parseFloat(data.costPrice)
    if (isNaN(price) || price < 0) {
      return 'Cost price must be a positive number'
    }
  }

  if (data.sellingPrice !== undefined) {
    const price = parseFloat(data.sellingPrice)
    if (isNaN(price) || price < 0) {
      return 'Selling price must be a positive number'
    }
  }

  if (data.itemType !== undefined && normalizeItemType(data.itemType) !== data.itemType) {
    return 'Invalid item type'
  }

  if (data.costPrice !== undefined && data.sellingPrice !== undefined && parseFloat(data.sellingPrice) < parseFloat(data.costPrice)) {
    return 'Selling price should not be less than cost price'
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
