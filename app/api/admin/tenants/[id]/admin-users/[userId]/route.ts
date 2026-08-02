import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { Role } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'
import {
  isTenantAdminRole,
  isTenantAdminUserRole,
  tenantAdminUserSelect,
} from '@/lib/admin/tenantAdminUsers'

interface RouteParams {
  params: Promise<{ id: string; userId: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const { id: tenantId, userId } = await params
    const body = await req.json()

    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!target) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    const name =
      body.name === undefined
        ? undefined
        : typeof body.name === 'string'
          ? body.name.trim()
          : ''
    const email =
      body.email === undefined
        ? undefined
        : typeof body.email === 'string'
          ? body.email.trim().toLowerCase()
          : ''
    const password =
      body.password === undefined
        ? undefined
        : typeof body.password === 'string'
          ? body.password
          : ''
    const role = body.role
    const isActive = body.isActive

    if (!isTenantAdminUserRole(target.role) && !isTenantAdminRole(role)) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    if (email !== undefined && !email) {
      return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 })
    }

    if (password !== undefined && password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (role !== undefined && !isTenantAdminRole(role)) {
      return NextResponse.json(
        { error: 'Role must be OWNER or STORE_MANAGER' },
        { status: 400 }
      )
    }

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be true or false' },
        { status: 400 }
      )
    }

    const nextRole = role ?? target.role
    const nextIsActive = isActive ?? target.isActive

    if (email && email !== target.email) {
      const [existingUser, existingPlatformAdmin] = await Promise.all([
        prisma.user.findUnique({
          where: { email },
          select: { id: true },
        }),
        prisma.platformAdmin.findUnique({
          where: { email },
          select: { id: true },
        }),
      ])

      if (existingUser && existingUser.id !== target.id) {
        return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      }

      if (existingPlatformAdmin) {
        return NextResponse.json(
          { error: 'That email is already used by a platform admin account' },
          { status: 409 }
        )
      }
    }

    if (target.role === Role.OWNER && (nextRole !== Role.OWNER || !nextIsActive)) {
      const otherActiveOwnerCount = await prisma.user.count({
        where: {
          tenantId,
          role: Role.OWNER,
          isActive: true,
          NOT: { id: target.id },
        },
      })

      if (otherActiveOwnerCount === 0) {
        return NextResponse.json(
          { error: 'Each tenant must keep at least one active owner account' },
          { status: 400 }
        )
      }
    }

    const updates: {
      name?: string
      email?: string
      password?: string
      role?: Role
      isActive?: boolean
    } = {}

    const changedFields: Record<string, { from: string | boolean | null; to: string | boolean | null }> = {}

    if (name !== undefined && name !== target.name) {
      updates.name = name
      changedFields.name = { from: target.name, to: name }
    }

    if (email !== undefined && email !== target.email) {
      updates.email = email
      changedFields.email = { from: target.email, to: email }
    }

    if (password !== undefined) {
      updates.password = await hash(password, 10)
      changedFields.passwordReset = { from: null, to: true }
    }

    if (role !== undefined && role !== target.role) {
      updates.role = role
      changedFields.role = { from: target.role, to: role }
    }

    if (isActive !== undefined && isActive !== target.isActive) {
      updates.isActive = isActive
      changedFields.isActive = { from: target.isActive, to: isActive }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No admin user changes to save' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: updates,
      select: tenantAdminUserSelect,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'tenant_admin_user.updated',
        entity: 'User',
        entityId: updated.id,
        details: {
          tenantId: target.tenant.id,
          tenantName: target.tenant.name,
          ...changedFields,
        },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[admin/tenants/:id/admin-users/:userId PATCH] Failed:', err)
    return NextResponse.json({ error: 'Failed to update admin user' }, { status: 500 })
  }
}
