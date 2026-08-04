import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  requireBranchAccess,
  requireOperationalBranch,
  canAccessBranch,
} from '@/lib/branch/server'
import { productKey } from '@/lib/items/identity'

/**
 * POST /api/items/copy-to-branch
 *
 * Copy item definitions from the current branch to another branch.
 *
 * Items are stored per branch, so selling the same product in two branches
 * means two rows. Typing them again by hand is how names drift apart — and a
 * drifted name silently splits one product into two in every company-wide
 * report. Copying keeps them identical by construction.
 *
 * Body: { targetBranchId: string, itemIds: string[] }
 *
 * Quantity is always 0 at the target: stock arrives by purchase or transfer,
 * never by copying a definition. Prices are carried over as a starting point;
 * the target branch can diverge afterwards.
 *
 * Safe to re-run — an item already present at the target is skipped, not
 * duplicated.
 *
 * Requires: create_items
 */

const MAX_ITEMS = 500

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_items')
    if (!authorized) return permError!

    // Copying reads from one specific branch, so "All Branches" is ambiguous.
    const { branchId: sourceBranchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select the branch you are copying from before continuing.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const targetBranchId = String(body.targetBranchId ?? '').trim()
    const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds : []

    if (!targetBranchId) {
      return NextResponse.json({ error: 'Choose a branch to copy into.' }, { status: 400 })
    }
    if (targetBranchId === sourceBranchId) {
      return NextResponse.json(
        { error: 'The target branch is the branch you are copying from.' },
        { status: 400 }
      )
    }
    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one item to copy.' }, { status: 400 })
    }
    if (itemIds.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Copy at most ${MAX_ITEMS} items at a time.` },
        { status: 400 }
      )
    }

    // The target must belong to this tenant and be one the caller may write to,
    // otherwise this becomes a way to seed a branch the user cannot see.
    const targetBranch = await prisma.branch.findFirst({
      where: { id: targetBranchId, tenantId: context!.tenantId },
      select: { id: true, name: true },
    })
    if (!targetBranch) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 })
    }
    if (!canAccessBranch(context!, targetBranchId)) {
      return NextResponse.json(
        { error: `You do not have access to ${targetBranch.name}.` },
        { status: 403 }
      )
    }

    const sourceItems = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId: context!.tenantId,
        ...(context!.branchesEnabled ? { branchId: sourceBranchId } : {}),
      },
    })

    if (sourceItems.length === 0) {
      return NextResponse.json(
        { error: 'None of the selected items are in this branch.' },
        { status: 404 }
      )
    }

    // Everything already at the target, keyed the same way stock transfers key
    // it, so a copy and a transfer agree on what "the same product" means.
    const existingAtTarget = await prisma.item.findMany({
      where: { tenantId: context!.tenantId, branchId: targetBranchId },
      select: { name: true, manufacturerId: true, unitName: true, barcode: true },
    })
    const existingKeys = new Set(
      existingAtTarget.map((i) => productKey(i.name, i.manufacturerId, i.unitName))
    )
    // Barcodes are unique per branch, so a clash has to be dropped rather than
    // carried over — two items sharing one barcode makes POS scanning ambiguous.
    const existingBarcodes = new Set(
      existingAtTarget.map((i) => i.barcode).filter((b): b is string => Boolean(b))
    )

    const results = { copied: 0, skipped: 0, errors: [] as string[] }
    const toCreate: {
      item: (typeof sourceItems)[number]
      barcode: string | null
      droppedBarcode: boolean
    }[] = []

    for (const item of sourceItems) {
      const key = productKey(item.name, item.manufacturerId, item.unitName)
      if (existingKeys.has(key)) {
        results.errors.push(`"${item.name}" is already in ${targetBranch.name} — skipped`)
        results.skipped++
        continue
      }
      // Guard against the same product appearing twice in one request.
      existingKeys.add(key)

      const clash = Boolean(item.barcode && existingBarcodes.has(item.barcode))
      if (item.barcode && !clash) existingBarcodes.add(item.barcode)
      toCreate.push({
        item,
        barcode: clash ? null : item.barcode,
        droppedBarcode: clash,
      })
    }

    if (toCreate.length > 0) {
      await prisma.$transaction(
        toCreate.map(({ item, barcode }) =>
          prisma.item.create({
            data: {
              tenantId: context!.tenantId,
              branchId: targetBranchId,
              manufacturerId: item.manufacturerId,
              categoryId: item.categoryId,
              name: item.name,
              // Definition only — stock arrives via purchase or transfer.
              quantity: 0,
              reorderLevel: item.reorderLevel,
              costPrice: item.costPrice,
              sellingPrice: item.sellingPrice,
              retailPrice: item.retailPrice,
              wholesalePrice: item.wholesalePrice,
              promoPrice: item.promoPrice,
              itemType: item.itemType,
              unitName: item.unitName,
              piecesPerUnit: item.piecesPerUnit,
              incomeAccountId: item.incomeAccountId,
              cogsAccountId: item.cogsAccountId,
              expenseAccountId: item.expenseAccountId,
              ...(barcode ? { barcode } : {}),
            },
          })
        )
      )
      results.copied = toCreate.length

      for (const { item, droppedBarcode } of toCreate) {
        if (droppedBarcode) {
          results.errors.push(
            `"${item.name}" was copied without its barcode — another item in ${targetBranch.name} already uses it.`
          )
        }
      }
    }

    return NextResponse.json({
      ...results,
      targetBranchName: targetBranch.name,
    })
  } catch (err) {
    console.error('Failed to copy items to branch:', err)
    return NextResponse.json({ error: 'Failed to copy items' }, { status: 500 })
  }
}
