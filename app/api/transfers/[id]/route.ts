import { ItemType, StockTransferStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  requireBranchAccess,
  requireBranchesEnabled,
} from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import {
  canCancelTransfer,
  canDispatchTransfer,
  canReceiveTransfer,
  canViewTransfer,
  normalizeTransferKey,
  serializeTransfer,
} from '@/lib/transfers/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireBranchesEnabled(context!, 'Enable branches to use stock transfers.')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { id } = await params
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { items: true },
    })

    if (!transfer || !canViewTransfer(context!, transfer)) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    }

    const [branches, users] = await Promise.all([
      prisma.branch.findMany({
        where: { tenantId: context!.tenantId },
        select: { id: true, name: true, isDefault: true },
      }),
      prisma.user.findMany({
        where: {
          tenantId: context!.tenantId,
          id: {
            in: [transfer.initiatedByUserId, transfer.dispatchedByUserId, transfer.receivedByUserId].filter(Boolean) as string[],
          },
        },
        select: { id: true, name: true },
      }),
    ])

    const branchMap = Object.fromEntries(branches.map((branch) => [branch.id, branch]))
    const userMap = Object.fromEntries(users.map((user) => [user.id, user]))

    return NextResponse.json(serializeTransfer(transfer, branchMap, userMap))
  } catch (err) {
    console.error('Failed to fetch stock transfer:', err)
    return NextResponse.json({ error: 'Failed to fetch stock transfer' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireBranchesEnabled(context!, 'Enable branches to use stock transfers.')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()
    const action = body.action ? String(body.action) : ''

    if (!['dispatch', 'receive', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid transfer action' }, { status: 400 })
    }

    const transfer = await prisma.stockTransfer.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { items: true },
    })

    if (!transfer || !canViewTransfer(context!, transfer)) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    }

    if (action === 'dispatch') {
      if (!canDispatchTransfer(context!, transfer)) {
        return NextResponse.json({ error: 'Select the source branch to dispatch this transfer' }, { status: 403 })
      }

      if (transfer.status !== StockTransferStatus.PENDING) {
        return NextResponse.json({ error: 'Only pending transfers can be dispatched' }, { status: 409 })
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Claim the transfer first. The status check above runs outside this
        // transaction, so two concurrent dispatches could both pass it and
        // both decrement — destroying stock. This conditional write is what
        // actually makes dispatch single-shot.
        const claimed = await tx.stockTransfer.updateMany({
          where: {
            id: transfer.id,
            tenantId: context!.tenantId,
            status: StockTransferStatus.PENDING,
          },
          data: {
            status: StockTransferStatus.IN_TRANSIT,
            dispatchedAt: new Date(),
            dispatchedByUserId: context!.user.id,
          },
        })
        if (claimed.count !== 1) {
          throw new Error('This transfer has already been dispatched.')
        }

        const sourceItems = await tx.item.findMany({
          where: {
            tenantId: context!.tenantId,
            branchId: transfer.fromBranchId,
            id: { in: transfer.items.map((item) => item.sourceItemId) },
          },
          select: { id: true, name: true, quantity: true, itemType: true },
        })

        const sourceItemMap = Object.fromEntries(sourceItems.map((item) => [item.id, item]))

        for (const transferItem of transfer.items) {
          const sourceItem = sourceItemMap[transferItem.sourceItemId]
          if (!sourceItem) {
            throw new Error(`Source item no longer exists for "${transferItem.itemName}"`)
          }
          // Only stock-tracked items can move between branches
          if (sourceItem.itemType !== ItemType.INVENTORY) {
            throw new Error(
              `"${sourceItem.name}" is not a stock-tracked item, so it cannot be transferred between branches.`
            )
          }
        }

        // Guarded decrement — the availability read above is not locked, so an
        // unguarded decrement could drive quantity negative.
        for (const transferItem of transfer.items) {
          const moved = await tx.item.updateMany({
            where: {
              id: transferItem.sourceItemId,
              tenantId: context!.tenantId,
              quantity: { gte: transferItem.quantity },
            },
            data: { quantity: { decrement: transferItem.quantity } },
          })
          if (moved.count !== 1) {
            const label = sourceItemMap[transferItem.sourceItemId]?.name ?? transferItem.itemName
            throw new Error(
              `Insufficient stock for "${label}". Another sale or transfer took it first — required ${transferItem.quantity}.`
            )
          }
        }

        return tx.stockTransfer.findFirstOrThrow({
          where: { id: transfer.id },
          include: { items: true },
        })
      })

      return NextResponse.json(updated)
    }

    if (action === 'receive') {
      if (!canReceiveTransfer(context!, transfer)) {
        return NextResponse.json({ error: 'Select the destination branch to receive this transfer' }, { status: 403 })
      }

      if (transfer.status !== StockTransferStatus.IN_TRANSIT) {
        return NextResponse.json({ error: 'Only in-transit transfers can be received' }, { status: 409 })
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Claim first — same reasoning as dispatch. Two concurrent receives
        // would otherwise both increment, fabricating stock out of nothing.
        const claimed = await tx.stockTransfer.updateMany({
          where: {
            id: transfer.id,
            tenantId: context!.tenantId,
            status: StockTransferStatus.IN_TRANSIT,
          },
          data: {
            status: StockTransferStatus.COMPLETED,
            receivedAt: new Date(),
            receivedByUserId: context!.user.id,
          },
        })
        if (claimed.count !== 1) {
          throw new Error('This transfer has already been received.')
        }

        const categoryIds = transfer.items
          .map((item) => item.categoryId)
          .filter(Boolean) as string[]
        const manufacturerIds = Array.from(new Set(transfer.items.map((item) => item.manufacturerId)))

        const [validCategories, destinationItems] = await Promise.all([
          categoryIds.length
            ? tx.category.findMany({
                where: { tenantId: context!.tenantId, id: { in: categoryIds } },
                select: { id: true },
              })
            : Promise.resolve([]),
          tx.item.findMany({
            where: {
              tenantId: context!.tenantId,
              branchId: transfer.toBranchId,
              manufacturerId: { in: manufacturerIds },
            },
            select: {
              id: true,
              manufacturerId: true,
              categoryId: true,
              name: true,
              barcode: true,
              unitName: true,
              piecesPerUnit: true,
            },
          }),
        ])

        const validCategoryIds = new Set(validCategories.map((category) => category.id))
        const destinationItemMap = new Map(
          destinationItems.map((item) => [
            normalizeTransferKey(item.name, item.manufacturerId, item.unitName),
            item,
          ])
        )

        for (const transferItem of transfer.items) {
          const existingDestinationItem = destinationItemMap.get(
            normalizeTransferKey(transferItem.itemName, transferItem.manufacturerId, transferItem.unitName)
          )

          if (existingDestinationItem) {
            await tx.item.update({
              where: { id: existingDestinationItem.id },
              data: {
                quantity: { increment: transferItem.quantity },
                costPrice: transferItem.costPrice,
                ...(existingDestinationItem.categoryId ? {} : transferItem.categoryId && validCategoryIds.has(transferItem.categoryId)
                  ? { categoryId: transferItem.categoryId }
                  : {}),
                ...(existingDestinationItem.barcode ? {} : transferItem.barcode ? { barcode: transferItem.barcode } : {}),
                ...(existingDestinationItem.unitName ? {} : transferItem.unitName ? { unitName: transferItem.unitName } : {}),
                ...(existingDestinationItem.piecesPerUnit ? {} : transferItem.piecesPerUnit ? { piecesPerUnit: transferItem.piecesPerUnit } : {}),
              },
            })
            continue
          }

          const createdItem = await tx.item.create({
            data: {
              tenantId: context!.tenantId,
              branchId: transfer.toBranchId,
              manufacturerId: transferItem.manufacturerId,
              ...(transferItem.categoryId && validCategoryIds.has(transferItem.categoryId)
                ? { categoryId: transferItem.categoryId }
                : {}),
              name: transferItem.itemName,
              // Explicit rather than relying on the schema default — only
              // INVENTORY items reach here (dispatch rejects the rest), and
              // being implicit is how a service could have become a tracked
              // product at the destination.
              itemType: ItemType.INVENTORY,
              quantity: transferItem.quantity,
              costPrice: transferItem.costPrice,
              sellingPrice: transferItem.sellingPrice,
              retailPrice: transferItem.retailPrice,
              wholesalePrice: transferItem.wholesalePrice,
              promoPrice: transferItem.promoPrice,
              barcode: transferItem.barcode,
              expiryDate: transferItem.expiryDate,
              unitName: transferItem.unitName,
              piecesPerUnit: transferItem.piecesPerUnit,
            },
            select: {
              id: true,
              manufacturerId: true,
              categoryId: true,
              name: true,
              barcode: true,
              unitName: true,
              piecesPerUnit: true,
            },
          })

          destinationItemMap.set(
            normalizeTransferKey(createdItem.name, createdItem.manufacturerId, createdItem.unitName),
            createdItem
          )
        }

        // Status was already set by the claim at the top of this transaction
        return tx.stockTransfer.findFirstOrThrow({
          where: { id: transfer.id },
          include: { items: true },
        })
      })

      return NextResponse.json(updated)
    }

    if (!canCancelTransfer(context!, transfer)) {
      return NextResponse.json({ error: 'Select the source branch to cancel this transfer' }, { status: 403 })
    }

    if (transfer.status !== StockTransferStatus.PENDING) {
      return NextResponse.json({ error: 'Only pending transfers can be cancelled' }, { status: 409 })
    }

    // Conditional so a cancel racing a dispatch cannot overwrite IN_TRANSIT —
    // that would leave stock decremented on a cancelled transfer with no way
    // to recover it.
    const cancelled = await prisma.stockTransfer.updateMany({
      where: {
        id: transfer.id,
        tenantId: context!.tenantId,
        status: StockTransferStatus.PENDING,
      },
      data: { status: StockTransferStatus.CANCELLED },
    })
    if (cancelled.count !== 1) {
      return NextResponse.json(
        { error: 'This transfer is no longer pending and can no longer be cancelled.' },
        { status: 409 }
      )
    }

    const updated = await prisma.stockTransfer.findFirst({
      where: { id: transfer.id },
      include: { items: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update stock transfer:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update stock transfer' },
      { status: 500 }
    )
  }
}
