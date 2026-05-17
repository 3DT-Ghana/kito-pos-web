import type { StockTransfer, StockTransferItem } from '@prisma/client'
import {
  canAccessBranch,
  getOperationalBranchId,
  type BranchAccessContext,
} from '@/lib/branch/server'

export type StockTransferWithItems = StockTransfer & {
  items: StockTransferItem[]
}

export function getTransferScopeWhere(context: BranchAccessContext) {
  if (context.allBranchesSelected) {
    return {}
  }

  if (context.currentBranchId) {
    return {
      OR: [
        { fromBranchId: context.currentBranchId },
        { toBranchId: context.currentBranchId },
      ],
    }
  }

  return {
    OR: [
      { fromBranchId: '__no_branch__' },
      { toBranchId: '__no_branch__' },
    ],
  }
}

export function canViewTransfer(context: BranchAccessContext, transfer: Pick<StockTransfer, 'fromBranchId' | 'toBranchId'>) {
  return canAccessBranch(context, transfer.fromBranchId) || canAccessBranch(context, transfer.toBranchId)
}

export function canDispatchTransfer(context: BranchAccessContext, transfer: Pick<StockTransfer, 'fromBranchId'>) {
  return getOperationalBranchId(context) === transfer.fromBranchId
}

export function canReceiveTransfer(context: BranchAccessContext, transfer: Pick<StockTransfer, 'toBranchId'>) {
  return getOperationalBranchId(context) === transfer.toBranchId
}

export function canCancelTransfer(context: BranchAccessContext, transfer: Pick<StockTransfer, 'fromBranchId'>) {
  return canDispatchTransfer(context, transfer)
}

export function normalizeTransferKey(itemName: string, manufacturerId: string, unitName: string | null | undefined) {
  return `${manufacturerId}::${itemName.trim().toLowerCase()}::${(unitName ?? '').trim().toLowerCase()}`
}

export function serializeTransfer(
  transfer: StockTransferWithItems,
  branchMap: Record<string, { id: string; name: string; isDefault?: boolean }>,
  userMap: Record<string, { id: string; name: string } | undefined>
) {
  return {
    id: transfer.id,
    tenantId: transfer.tenantId,
    fromBranchId: transfer.fromBranchId,
    toBranchId: transfer.toBranchId,
    status: transfer.status,
    note: transfer.note,
    initiatedByUserId: transfer.initiatedByUserId,
    dispatchedByUserId: transfer.dispatchedByUserId,
    receivedByUserId: transfer.receivedByUserId,
    dispatchedAt: transfer.dispatchedAt,
    receivedAt: transfer.receivedAt,
    createdAt: transfer.createdAt,
    fromBranch: branchMap[transfer.fromBranchId] ?? null,
    toBranch: branchMap[transfer.toBranchId] ?? null,
    initiatedBy: userMap[transfer.initiatedByUserId] ?? null,
    dispatchedBy: transfer.dispatchedByUserId ? userMap[transfer.dispatchedByUserId] ?? null : null,
    receivedBy: transfer.receivedByUserId ? userMap[transfer.receivedByUserId] ?? null : null,
    items: transfer.items,
  }
}
