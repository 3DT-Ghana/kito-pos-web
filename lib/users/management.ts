import { NextResponse } from 'next/server'
import type { BranchAccessContext } from '@/lib/branch/server'
import {
  Role,
  canManageTargetUserRole,
  canManageUsersForRole,
  getManageableRolesForRole,
  type Role as UserRole,
} from '@/lib/permissions/rbac'

export interface UserManagementScope {
  mode: 'tenant' | 'branch'
  branchId: string | null
  allowedRoles: readonly UserRole[]
}

export function resolveUserManagementScope(context: BranchAccessContext): {
  error: NextResponse | null
  scope: UserManagementScope | null
} {
  if (!canManageUsersForRole(context.user.role)) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'You do not have permission to manage users.',
        },
        { status: 403 }
      ),
      scope: null,
    }
  }

  if (context.user.role === Role.BRANCH_MANAGER) {
    if (!context.assignedBranchId) {
      return {
        error: NextResponse.json(
          {
            error: 'Branch assignment required',
            message: 'Assign this branch manager to a branch before allowing team management.',
          },
          { status: 400 }
        ),
        scope: null,
      }
    }

    return {
      error: null,
      scope: {
        mode: 'branch',
        branchId: context.assignedBranchId,
        allowedRoles: getManageableRolesForRole(context.user.role),
      },
    }
  }

  return {
    error: null,
    scope: {
      mode: 'tenant',
      branchId: null,
      allowedRoles: getManageableRolesForRole(context.user.role),
    },
  }
}

export function canManageUserRecord(
  context: BranchAccessContext,
  scope: UserManagementScope,
  targetUser: { id: string; role: UserRole; branchId: string | null }
) {
  if (scope.mode === 'tenant') {
    return true
  }

  if (targetUser.id === context.user.id) {
    return true
  }

  return targetUser.branchId === scope.branchId && canManageTargetUserRole(context.user.role, targetUser.role)
}
