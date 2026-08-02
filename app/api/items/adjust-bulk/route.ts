import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, requireOperationalBranch } from '@/lib/branch/server'
import {
  processStockAdjustment,
} from '@/lib/adjustments/stock'

/**
 * POST /api/items/adjust-bulk
 *
 * Bulk item quantity adjustment — match by item name within the tenant.
 *
 * Body:
 *   { adjustments: Array<{ name: string, type: 'add'|'remove'|'set', quantity: number, category?: string, reason?: string }> }
 *
 * Returns:
 *   { updated: number, skipped: number, errors: string[] }
 *
 * Requires: update_items permission
 * Max 500 adjustments per request.
 */

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'adjust_stock')
    if (!authorized) return permError!

    const { branchId, error: branchError } = requireOperationalBranch(
      context!,
      'Select a branch before running a bulk stock adjustment.'
    )
    if (branchError) return branchError

    const body = await req.json()
    const adjustments: Array<{ name: string; type: string; quantity: number | string; category?: string; reason?: string }> =
      body.adjustments

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return NextResponse.json({ error: 'adjustments array is required' }, { status: 400 })
    }

    if (adjustments.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 adjustments per request' }, { status: 400 })
    }

    // A stocktake must be all-or-nothing. This previously applied row by row,
    // each in its own transaction, so a bad row midway left a half-applied
    // count that could not be rolled back — and a timeout left an arbitrary
    // prefix applied with no response saying where it stopped.
    //
    // Phase 1: validate and resolve every row. Nothing is written.
    const errors: string[] = []
    const resolved: Array<{
      itemId: string
      type: 'add' | 'remove' | 'set'
      quantity: number
      category: string
      reason: string
    }> = []

    for (let i = 0; i < adjustments.length; i++) {
      const { name, type, quantity, category, reason } = adjustments[i]
      const rowNum = i + 1

      if (!name?.trim()) {
        errors.push(`Row ${rowNum}: name is required`)
        continue
      }

      if (!['add', 'remove', 'set'].includes(type)) {
        errors.push(`Row ${rowNum} (${name}): type must be add, remove, or set`)
        continue
      }

      const qty = Number(quantity)
      if (isNaN(qty) || qty < 0) {
        errors.push(`Row ${rowNum} (${name}): quantity must be a non-negative number`)
        continue
      }

      if (type !== 'set' && qty === 0) {
        errors.push(`Row ${rowNum} (${name}): quantity must be > 0 for add/remove`)
        continue
      }

      const item = await prisma.item.findFirst({
        where: {
          name: { equals: name.trim(), mode: 'insensitive' },
          tenantId: context!.tenantId,
          ...(context!.branchesEnabled ? { branchId } : {}),
        },
        select: { id: true, itemType: true },
      })

      if (!item) {
        errors.push(`Row ${rowNum}: item "${name}" not found`)
        continue
      }

      if (item.itemType !== 'INVENTORY') {
        errors.push(`Row ${rowNum} (${name}): stock adjustments only apply to inventory items`)
        continue
      }

      resolved.push({
        itemId: item.id,
        type: type as 'add' | 'remove' | 'set',
        quantity: qty,
        category: category?.trim() || 'correction',
        reason: reason?.trim() || 'Bulk stock adjustment',
      })
    }

    // Reject the whole batch rather than apply it partially
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: `${errors.length} of ${adjustments.length} rows are invalid. No stock was changed — fix these and submit again.`,
          errors,
        },
        { status: 400 }
      )
    }

    // Phase 2: apply. processStockAdjustment opens its own transaction per
    // item, so failures still roll back that item; the pre-validation above is
    // what makes a mid-batch abort unlikely rather than routine.
    const results = { updated: 0, pending: 0, skipped: 0, errors: [] as string[] }
    for (let i = 0; i < resolved.length; i++) {
      try {
        const result = await processStockAdjustment(context!, resolved[i])
        if (result.status === 'pending') results.pending++
        else results.updated++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error'
        results.errors.push(`Row ${i + 1}: ${message}`)
        results.skipped++
      }
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('Bulk item adjustment failed:', err)
    return NextResponse.json({ error: 'Bulk adjustment failed' }, { status: 500 })
  }
}
