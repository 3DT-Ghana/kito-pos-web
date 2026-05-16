import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, validateTenantBranch } from '@/lib/branch/server'
import {
  ALL_ROLES,
  Role,
  canManageTargetUserRole,
  canManageUsersForRole,
  hasPermission,
  requirePermission,
} from '@/lib/permissions/rbac'
import { resolveUserManagementScope } from '@/lib/users/management'

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const canManageUsers = canManageUsersForRole(context!.user.role)
    const canViewDirectory = canManageUsers || hasPermission(context!, 'view_audit_logs')

    if (!canViewDirectory) {
      return NextResponse.json(
        { error: 'You do not have permission to view users' },
        { status: 403 }
      )
    }

    if (!canManageUsers) {
      const users = await prisma.user.findMany({
        where: { tenantId: context!.tenantId },
        select: {
          id: true,
          name: true,
          role: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      return NextResponse.json({ users })
    }

    const { error: scopeError, scope } = resolveUserManagementScope(context!)
    if (scopeError) return scopeError

    const users = await prisma.user.findMany({
      where:
        scope!.mode === 'branch'
          ? {
              tenantId: context!.tenantId,
              OR: [
                {
                  branchId: scope!.branchId,
                  role: { in: [...scope!.allowedRoles] },
                },
                { id: context!.user.id },
              ],
            }
          : { tenantId: context!.tenantId },
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
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      users,
      meta: {
        scope: scope!.mode,
        managedBranchId: scope!.branchId,
        allowedRoles: [...scope!.allowedRoles],
      },
    })
  } catch (err) {
    console.error('Failed to fetch users:', err)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_users')
    if (!authorized) return permError!

    const { error: scopeError, scope } = resolveUserManagementScope(context!)
    if (scopeError) return scopeError!

    const body = await req.json()

    if (!body.name || !body.email || !body.password || !body.role) {
      return NextResponse.json({ error: 'Name, email, password and role are required' }, { status: 400 })
    }

    if (!ALL_ROLES.includes(body.role as typeof ALL_ROLES[number])) {
      return NextResponse.json({ error: `Role must be one of: ${ALL_ROLES.join(', ')}` }, { status: 400 })
    }

    const requestedRole = body.role as Role
    if (!canManageTargetUserRole(context!.user.role, requestedRole)) {
      return NextResponse.json(
        { error: 'You cannot create users with that role' },
        { status: 403 }
      )
    }

    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    let branchId = body.branchId ? String(body.branchId) : null

    if (scope!.mode === 'branch') {
      if (branchId && branchId !== scope!.branchId) {
        return NextResponse.json(
          { error: 'Branch managers can only create users in their own branch' },
          { status: 403 }
        )
      }

      branchId = scope!.branchId
    }

    if (requestedRole === Role.BRANCH_MANAGER && !branchId) {
      return NextResponse.json(
        { error: 'Branch managers must be assigned to a branch' },
        { status: 400 }
      )
    }

    const branch = await validateTenantBranch(context!.tenantId, branchId)
    if (branchId && !branch) {
      return NextResponse.json({ error: 'Selected branch does not belong to your business' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const hashedPassword = await hash(body.password, 10)

    const newUser = await prisma.user.create({
      data: {
        tenantId: context!.tenantId,
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        password: hashedPassword,
        role: requestedRole as never,
        branchId,
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

    return NextResponse.json(newUser, { status: 201 })
  } catch (err) {
    console.error('Failed to create user:', err)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
