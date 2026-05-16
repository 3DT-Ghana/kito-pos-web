import {
  isBranchFilterActive,
  type BranchAccessContext,
} from '@/lib/branch/server'

export function buildVisibleQuotationWhere(
  context: BranchAccessContext,
  extra: Record<string, unknown> = {}
) {
  if (!isBranchFilterActive(context)) {
    return {
      tenantId: context.tenantId,
      ...extra,
    }
  }

  if (!context.currentBranchId) {
    return null
  }

  return {
    tenantId: context.tenantId,
    ...extra,
    OR: [
      { branchId: context.currentBranchId },
      { branchId: null },
    ],
  }
}
