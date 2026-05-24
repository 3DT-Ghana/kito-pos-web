import type { Session } from 'next-auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { ALL_BRANCHES_SELECTION, BRANCH_SELECTION_COOKIE } from '@/lib/branch/constants'
import {
  canViewAllBranchesForRole,
  type RolePermissionsMap,
} from '@/lib/permissions/rbac'
import {
  TENANT_FEATURE_SELECT,
  type TenantFeatureFlags,
} from '@/lib/tenant/features'

export interface BranchSummary {
  id: string
  name: string
  isDefault: boolean
}

export interface BranchAccessContext {
  tenantId: string
  user: Session['user']
  rolePermissions: RolePermissionsMap | null
  features: TenantFeatureFlags
  branchesEnabled: boolean
  branches: BranchSummary[]
  currentBranchId: string | null
  currentBranch: BranchSummary | null
  assignedBranchId: string | null
  canViewAllBranches: boolean
  isBranchLocked: boolean
  allBranchesSelected: boolean
}

export async function requireBranchAccess(): Promise<{
  error: NextResponse | null
  context: BranchAccessContext | null
}> {
  const base = await requireTenant()
  if (base.error) {
    return { error: base.error, context: null }
  }

  const [userRecord, allBranches] = await Promise.all([
    prisma.user.findFirst({
      where: { id: base.user!.id, tenantId: base.tenantId! },
      select: {
        branchId: true,
        tenant: {
          select: {
            rolePermissions: true,
            ...TENANT_FEATURE_SELECT,
          },
        },
      },
    }),
    prisma.branch.findMany({
      where: { tenantId: base.tenantId! },
      select: {
        id: true,
        name: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }),
  ])

  if (!userRecord) {
    return {
      error: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Your user record could not be found. Please sign in again.',
        },
        { status: 401 }
      ),
      context: null,
    }
  }

  const features: TenantFeatureFlags = {
    enableBranches: Boolean(userRecord.tenant.enableBranches),
    enableQuotations: Boolean(userRecord.tenant.enableQuotations),
    enablePurchaseOrders: Boolean(userRecord.tenant.enablePurchaseOrders),
    enableTill: Boolean(userRecord.tenant.enableTill),
    enableAccounting: Boolean(userRecord.tenant.enableAccounting),
    enablePayroll: Boolean(userRecord.tenant.enablePayroll),
    requireApproval: Boolean(userRecord.tenant.requireApproval),
    enablePosTerminal: Boolean(userRecord.tenant.enablePosTerminal),
    enableExpenses: Boolean(userRecord.tenant.enableExpenses),
    enableBarcodeGenerator: Boolean(userRecord.tenant.enableBarcodeGenerator),
    enableExpiryTracking: Boolean(userRecord.tenant.enableExpiryTracking),
    enableCreditSales: Boolean(userRecord.tenant.enableCreditSales),
    enableSmsNotifications: Boolean(userRecord.tenant.enableSmsNotifications),
  }
  const branchesEnabled = features.enableBranches
  const canViewAllBranches = canViewAllBranchesForRole(base.user!.role)
  const branchIds = new Set(allBranches.map((branch) => branch.id))
  const assignedBranchId =
    userRecord.branchId && branchIds.has(userRecord.branchId)
      ? userRecord.branchId
      : null

  const defaultBranchForFallback = allBranches.find((branch) => branch.isDefault) ?? allBranches[0] ?? null

  if (branchesEnabled && !canViewAllBranches && !assignedBranchId && !defaultBranchForFallback) {
    return {
      error: NextResponse.json(
        {
          error: 'Branch assignment required',
          message:
            'Your account is not assigned to a valid branch. Ask an administrator to assign you before continuing.',
        },
        { status: 403 }
      ),
      context: null,
    }
  }

  const visibleBranches =
    assignedBranchId && !canViewAllBranches
      ? allBranches.filter((branch) => branch.id === assignedBranchId)
      : allBranches

  let currentBranchId: string | null = null

  if (branchesEnabled && allBranches.length > 0) {
    const cookieStore = await cookies()
    const rawSelection = cookieStore.get(BRANCH_SELECTION_COOKIE)?.value?.trim()

    if (assignedBranchId && !canViewAllBranches) {
      currentBranchId = assignedBranchId
    } else if (!assignedBranchId && !canViewAllBranches) {
      // Unassigned user — fall back to the default branch so they aren't blocked
      currentBranchId = defaultBranchForFallback?.id ?? null
    } else if (canViewAllBranches && rawSelection === ALL_BRANCHES_SELECTION) {
      currentBranchId = null
    } else if (rawSelection && rawSelection !== ALL_BRANCHES_SELECTION && branchIds.has(rawSelection)) {
      currentBranchId = rawSelection
    } else {
      currentBranchId = assignedBranchId ?? defaultBranchForFallback?.id ?? null
    }
  }

  const currentBranch =
    currentBranchId === null
      ? null
      : allBranches.find((branch) => branch.id === currentBranchId) ?? null

  return {
    error: null,
    context: {
      tenantId: base.tenantId!,
      user: base.user!,
      rolePermissions: (userRecord.tenant.rolePermissions as RolePermissionsMap | null) ?? null,
      features,
      branchesEnabled,
      branches: visibleBranches,
      currentBranchId,
      currentBranch,
      assignedBranchId,
      canViewAllBranches,
      isBranchLocked: Boolean(assignedBranchId && !canViewAllBranches),
      allBranchesSelected: branchesEnabled && canViewAllBranches && currentBranchId === null,
    },
  }
}

export function applyBranchScope<T extends Record<string, unknown>>(
  where: T,
  context: BranchAccessContext
): T & { branchId?: string | null } {
  if (!isBranchFilterActive(context)) {
    return where as T & { branchId?: string | null }
  }

  return {
    ...where,
    branchId: context.currentBranchId,
  }
}

export function isBranchFilterActive(context: BranchAccessContext) {
  return context.branchesEnabled && !context.allBranchesSelected
}

export function getOperationalBranchId(context: BranchAccessContext) {
  if (!context.branchesEnabled) {
    return null
  }

  return context.currentBranchId ?? context.assignedBranchId ?? null
}

export function requireOperationalBranch(
  context: BranchAccessContext,
  message = 'Select a branch before performing this action.'
) {
  if (!context.branchesEnabled) {
    return { branchId: null as string | null, error: null as NextResponse | null }
  }

  const branchId = getOperationalBranchId(context)
  if (branchId) {
    return { branchId, error: null as NextResponse | null }
  }

  const fallbackMessage =
    context.branches.length === 0
      ? 'Create a branch first before recording branch-specific data.'
      : context.allBranchesSelected
        ? 'You are viewing All Branches. Select a specific branch before performing this action.'
        : message

  return {
    branchId: null as string | null,
    error: NextResponse.json({ error: fallbackMessage }, { status: 400 }),
  }
}

export function requireBranchesEnabled(
  context: BranchAccessContext,
  message = 'Enable branches to use this feature.'
) {
  if (context.branchesEnabled) return null
  return NextResponse.json({ error: message }, { status: 400 })
}

export function canAccessBranch(
  context: BranchAccessContext,
  branchId: string | null | undefined
) {
  if (!branchId) return false
  return context.branches.some((branch) => branch.id === branchId)
}

export async function validateTenantBranch(tenantId: string, branchId: string | null | undefined) {
  if (!branchId) return null

  return prisma.branch.findFirst({
    where: {
      id: branchId,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      isDefault: true,
    },
  })
}
