import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'
import {
  isTenantAdminRole,
  tenantAdminUserSelect,
} from '@/lib/admin/tenantAdminUsers'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const { id: tenantId } = await params
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (!isTenantAdminRole(role)) {
      return NextResponse.json(
        { error: 'Role must be OWNER or STORE_MANAGER' },
        { status: 400 }
      )
    }

    const [tenant, existingUser, existingPlatformAdmin] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      prisma.platformAdmin.findUnique({
        where: { email },
        select: { id: true },
      }),
    ])

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    if (existingUser) {
      return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
    }

    if (existingPlatformAdmin) {
      return NextResponse.json(
        { error: 'That email is already used by a platform admin account' },
        { status: 409 }
      )
    }

    const adminUser = await prisma.user.create({
      data: {
        tenantId,
        name,
        email,
        password: await hash(password, 10),
        role,
        branchId: null,
      },
      select: tenantAdminUserSelect,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'tenant_admin_user.created',
        entity: 'User',
        entityId: adminUser.id,
        details: {
          tenantId: tenant.id,
          tenantName: tenant.name,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        },
      },
    })

    return NextResponse.json(adminUser, { status: 201 })
  } catch (err) {
    console.error('[admin/tenants/:id/admin-users POST] Failed:', err)
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 })
  }
}
