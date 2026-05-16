import { StockTransferStatus } from '@prisma/client'
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
        const sourceItems = await tx.item.findMany({
          where: {
            tenantId: context!.tenantId,
            branchId: transfer.fromBranchId,
            id: { in: transfer.items.map((item) => item.sourceItemId) },
          },
          select: { id: true, name: true, quantity: true },
        })

        const sourceItemMap = Object.fromEntries(sourceItems.map((item) => [item.id, item]))

        for (const transferItem of transfer.items) {
          const sourceItem = sourceItemMap[transferItem.sourceItemId]
          if (!sourceItem) {
            throw new Error(`Source item no longer exists for "${transferItem.itemName}"`)
          }

          if (sourceItem.quantity < transferItem.quantity) {
            throw new Error(
              `Insufficient stock for "${sourceItem.name}". Available: ${sourceItem.quantity}, required: ${transferItem.quantity}`
            )
          }
        }

        for (const transferItem of transfer.items) {
          await tx.item.update({
            where: { id: transferItem.sourceItemId },
            data: { quantity: { decrement: transferItem.quantity } },
          })
        }

        return tx.stockTransfer.update({
          where: { id: transfer.id },
          data: {
            status: StockTransferStatus.IN_TRANSIT,
            dispatchedAt: new Date(),
            dispatchedByUserId: context!.user.id,
          },
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

        return tx.stockTransfer.update({
          where: { id: transfer.id },
          data: {
            status: StockTransferStatus.COMPLETED,
            receivedAt: new Date(),
            receivedByUserId: context!.user.id,
          },
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

    const updated = await prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: StockTransferStatus.CANCELLED },
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
