import { ItemType, StockTransferStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  requireBranchAccess,
  requireBranchesEnabled,
  requireOperationalBranch,
  validateTenantBranch,
} from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { getTransferScopeWhere, serializeTransfer } from '@/lib/transfers/server'

interface RequestedTransferItem {
  itemId: string
  quantity: number
}

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const branchError = requireBranchesEnabled(context!, 'Enable branches to use stock transfers.')
    if (branchError) return branchError

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status')

    if (statusParam && !Object.values(StockTransferStatus).includes(statusParam as StockTransferStatus)) {
      return NextResponse.json({ error: 'Invalid transfer status' }, { status: 400 })
    }

    const [branches, transfers] = await Promise.all([
      prisma.branch.findMany({
        where: { tenantId: context!.tenantId },
        select: { id: true, name: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.stockTransfer.findMany({
        where: {
          tenantId: context!.tenantId,
          ...getTransferScopeWhere(context!),
          ...(statusParam ? { status: statusParam as StockTransferStatus } : {}),
        },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const userIds = Array.from(
      new Set(
        transfers.flatMap((transfer) =>
          [transfer.initiatedByUserId, transfer.dispatchedByUserId, transfer.receivedByUserId].filter(Boolean)
        )
      )
    ) as string[]

    const users = userIds.length
      ? await prisma.user.findMany({
          where: { tenantId: context!.tenantId, id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []

    const branchMap = Object.fromEntries(branches.map((branch) => [branch.id, branch]))
    const userMap = Object.fromEntries(users.map((user) => [user.id, user]))

    return NextResponse.json({
      transfers: transfers.map((transfer) => serializeTransfer(transfer, branchMap, userMap)),
      branches,
      context: {
        currentBranchId: context!.currentBranchId,
        canViewAllBranches: context!.canViewAllBranches,
        isBranchLocked: context!.isBranchLocked,
      },
    })
  } catch (err) {
    console.error('Failed to fetch stock transfers:', err)
    return NextResponse.json({ error: 'Failed to fetch stock transfers' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireBranchesEnabled(context!, 'Enable branches to use stock transfers.')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { branchId: fromBranchId, error: sourceBranchError } = requireOperationalBranch(
      context!,
      'Select a source branch before creating a transfer.'
    )
    if (sourceBranchError) return sourceBranchError
    if (!fromBranchId) {
      return NextResponse.json({ error: 'Source branch is required' }, { status: 400 })
    }

    const body = await req.json()
    const destinationBranchId = body.toBranchId ? String(body.toBranchId) : ''
    const note = body.note ? String(body.note).trim() : null

    if (!destinationBranchId) {
      return NextResponse.json({ error: 'Destination branch is required' }, { status: 400 })
    }

    if (destinationBranchId === fromBranchId) {
      return NextResponse.json({ error: 'Source and destination branches must be different' }, { status: 400 })
    }

    const destinationBranch = await validateTenantBranch(context!.tenantId, destinationBranchId)
    if (!destinationBranch) {
      return NextResponse.json({ error: 'Destination branch not found' }, { status: 404 })
    }

    const normalizedItems = normalizeRequestedItems(body.items)
    if (typeof normalizedItems === 'string') {
      return NextResponse.json({ error: normalizedItems }, { status: 400 })
    }

    const sourceItems = await prisma.item.findMany({
      where: {
        tenantId: context!.tenantId,
        branchId: fromBranchId,
        id: { in: normalizedItems.map((item) => item.itemId) },
      },
      select: {
        id: true,
        itemType: true,
        manufacturerId: true,
        categoryId: true,
        name: true,
        barcode: true,
        expiryDate: true,
        unitName: true,
        piecesPerUnit: true,
        quantity: true,
        costPrice: true,
        sellingPrice: true,
        retailPrice: true,
        wholesalePrice: true,
        promoPrice: true,
      },
    })

    const sourceItemMap = Object.fromEntries(sourceItems.map((item) => [item.id, item]))

    for (const requestedItem of normalizedItems) {
      const sourceItem = sourceItemMap[requestedItem.itemId]
      if (!sourceItem) {
        return NextResponse.json({ error: `Item not found in the selected branch: ${requestedItem.itemId}` }, { status: 404 })
      }

      // Services and non-inventory items have no stock to move; transferring
      // one drove its quantity negative and created a tracked INVENTORY item
      // at the destination.
      if (sourceItem.itemType !== ItemType.INVENTORY) {
        return NextResponse.json(
          { error: `"${sourceItem.name}" is not a stock-tracked item, so it cannot be transferred between branches.` },
          { status: 400 }
        )
      }

      if (sourceItem.quantity < requestedItem.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for "${sourceItem.name}". Available: ${sourceItem.quantity}, requested: ${requestedItem.quantity}`,
          },
          { status: 400 }
        )
      }
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        tenantId: context!.tenantId,
        fromBranchId,
        toBranchId: destinationBranchId,
        note,
        initiatedByUserId: context!.user.id,
        items: {
          create: normalizedItems.map((requestedItem) => {
            const sourceItem = sourceItemMap[requestedItem.itemId]
            return {
              sourceItemId: sourceItem.id,
              manufacturerId: sourceItem.manufacturerId,
              categoryId: sourceItem.categoryId,
              itemName: sourceItem.name,
              barcode: sourceItem.barcode,
              expiryDate: sourceItem.expiryDate,
              unitName: sourceItem.unitName,
              piecesPerUnit: sourceItem.piecesPerUnit,
              quantity: requestedItem.quantity,
              costPrice: sourceItem.costPrice,
              sellingPrice: sourceItem.sellingPrice,
              retailPrice: sourceItem.retailPrice,
              wholesalePrice: sourceItem.wholesalePrice,
              promoPrice: sourceItem.promoPrice,
            }
          }),
        },
      },
      include: { items: true },
    })

    return NextResponse.json(transfer, { status: 201 })
  } catch (err) {
    console.error('Failed to create stock transfer:', err)
    return NextResponse.json({ error: 'Failed to create stock transfer' }, { status: 500 })
  }
}

function normalizeRequestedItems(input: unknown): RequestedTransferItem[] | string {
  if (!Array.isArray(input) || input.length === 0) {
    return 'Add at least one item to transfer'
  }

  const quantities = new Map<string, number>()

  for (const row of input) {
    if (!row || typeof row !== 'object') {
      return 'Each transfer line must include an item and quantity'
    }

    const itemId = 'itemId' in row ? String(row.itemId ?? '').trim() : ''
    const quantity = 'quantity' in row ? Number(row.quantity) : NaN

    if (!itemId) {
      return 'Each transfer line must include an item'
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'Each transfer quantity must be greater than zero'
    }

    quantities.set(itemId, (quantities.get(itemId) ?? 0) + quantity)
  }

  return Array.from(quantities.entries()).map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }))
}
