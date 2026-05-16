import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { requireBranchAccess } from '@/lib/branch/server'
import {
  processStockAdjustment,
  StockAdjustmentError,
} from '@/lib/adjustments/stock'

/**
 * POST /api/items/[id]/adjust
 * Adjust item quantity (add, remove, or set absolute).
 * Atomically updates item stock and writes a StockAdjustment audit record.
 * Requires: update_items permission
 *
 * Body:
 *   type:     'add' | 'remove' | 'set'
 *   quantity: number
 *   category: string   (predefined reason category key)
 *   reason:   string   (required note)
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'update_items')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()
    const result = await processStockAdjustment(context!, {
      itemId: id,
      type: body.type,
      quantity: Number(body.quantity),
      category: body.category,
      reason: typeof body.reason === 'string' ? body.reason : '',
    })

    if (result.status === 'pending') {
      return NextResponse.json(
        {
          requiresApproval: true,
          adjustmentId: result.adjustmentId,
          message: 'This stock adjustment requires manager approval before it takes effect.',
        },
        { status: 202 }
      )
    }

    return NextResponse.json({
      ...result.updatedItem,
      adjustment: {
        type: body.type,
        category: body.category || 'other',
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        change: result.newQuantity - result.previousQuantity,
        reason: String(body.reason).trim(),
      },
    })
  } catch (err) {
    console.error('Failed to adjust quantity:', err)
    const message =
      err instanceof Error ? err.message : 'Failed to adjust quantity'
    const status = err instanceof StockAdjustmentError ? err.status : 500
    return NextResponse.json(
      { error: message },
      { status }
    )
  }
}
