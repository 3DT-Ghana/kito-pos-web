import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, validateTenantBranch } from '@/lib/branch/server'
import {
  ALL_ROLES,
  Role,
  canManageTargetUserRole,
  requirePermission,
} from '@/lib/permissions/rbac'
import { canManageUserRecord, resolveUserManagementScope } from '@/lib/users/management'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'update_user_roles')
    if (!authorized) return permError!

    const { error: scopeError, scope } = resolveUserManagementScope(context!)
    if (scopeError) return scopeError!

    const { id } = await params
    const body = await req.json()

    const targetUser = await prisma.user.findFirst({ where: { id, tenantId: context!.tenantId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!canManageUserRecord(context!, scope!, targetUser)) {
      return NextResponse.json(
        { error: 'You can only manage staff in your assigned branch' },
        { status: 403 }
      )
    }

    if (body.role && !ALL_ROLES.includes(body.role as typeof ALL_ROLES[number])) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}` }, { status: 400 })
    }

    const requestedRole = body.role ? (body.role as Role) : targetUser.role
    if (!canManageTargetUserRole(context!.user.role, requestedRole)) {
      return NextResponse.json(
        { error: 'You cannot assign that role' },
        { status: 403 }
      )
    }

    let normalizedBranchId =
      body.branchId !== undefined ? (body.branchId ? String(body.branchId) : null) : targetUser.branchId

    if (scope!.mode === 'branch') {
      if (body.branchId !== undefined && normalizedBranchId !== scope!.branchId) {
        return NextResponse.json(
          { error: 'Branch managers cannot move users outside their branch' },
          { status: 403 }
        )
      }

      normalizedBranchId = scope!.branchId
    }

    if (requestedRole === Role.BRANCH_MANAGER && !normalizedBranchId) {
      return NextResponse.json(
        { error: 'Branch managers must be assigned to a branch' },
        { status: 400 }
      )
    }

    if (body.branchId !== undefined) {
      const branch = await validateTenantBranch(context!.tenantId, normalizedBranchId)
      if (normalizedBranchId && !branch) {
        return NextResponse.json({ error: 'Selected branch does not belong to your business' }, { status: 400 })
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.role && { role: requestedRole as never }),
        ...(body.branchId !== undefined && { branchId: normalizedBranchId }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update user:', err)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'delete_users')
    if (!authorized) return permError!

    const { error: scopeError, scope } = resolveUserManagementScope(context!)
    if (scopeError) return scopeError!

    const { id } = await params

    if (id === context!.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const targetUser = await prisma.user.findFirst({ where: { id, tenantId: context!.tenantId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!canManageUserRecord(context!, scope!, targetUser)) {
      return NextResponse.json(
        { error: 'You can only remove staff in your assigned branch' },
        { status: 403 }
      )
    }

    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (err) {
    console.error('Failed to delete user:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
