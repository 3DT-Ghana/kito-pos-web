import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

const platformAdminSelect = {
  id: true,
  name: true,
  email: true,
  createdByEmail: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const { id } = await params
    const body = await req.json()

    const target = await prisma.platformAdmin.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    if (!target) {
      return NextResponse.json({ error: 'Platform admin not found' }, { status: 404 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const password = typeof body.password === 'string' ? body.password : undefined

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    if (password !== undefined && password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (name === undefined && password === undefined) {
      return NextResponse.json(
        { error: 'Provide a name or password to update' },
        { status: 400 }
      )
    }

    const updated = await prisma.platformAdmin.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(password !== undefined ? { passwordHash: await hash(password, 10) } : {}),
      },
      select: platformAdminSelect,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: password !== undefined ? 'platform_admin.password_reset' : 'platform_admin.updated',
        entity: 'PlatformAdmin',
        entityId: updated.id,
        details: {
          email: updated.email,
          nameChanged: name !== undefined,
          passwordReset: password !== undefined,
        },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[admin/platform-admins/:id] Failed to update platform admin:', err)
    return NextResponse.json({ error: 'Failed to update platform admin' }, { status: 500 })
  }
}
