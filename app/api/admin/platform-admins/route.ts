import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'

const platformAdminSelect = {
  id: true,
  name: true,
  email: true,
  createdByEmail: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET() {
  try {
    const { error } = await requireSuperAdmin()
    if (error) return error

    const platformAdmins = await prisma.platformAdmin.findMany({
      select: platformAdminSelect,
      orderBy: [{ createdAt: 'desc' }],
    })

    return NextResponse.json(platformAdmins)
  } catch (err) {
    console.error('[admin/platform-admins] Failed to list platform admins:', err)
    return NextResponse.json({ error: 'Failed to load platform admins' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

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

    const existing = await prisma.platformAdmin.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A platform admin with that email already exists' },
        { status: 409 }
      )
    }

    const platformAdmin = await prisma.platformAdmin.create({
      data: {
        name,
        email,
        passwordHash: await hash(password, 10),
        createdByEmail: context!.email,
      },
      select: platformAdminSelect,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'platform_admin.created',
        entity: 'PlatformAdmin',
        entityId: platformAdmin.id,
        details: {
          email: platformAdmin.email,
          name: platformAdmin.name,
        },
      },
    })

    return NextResponse.json(platformAdmin, { status: 201 })
  } catch (err) {
    console.error('[admin/platform-admins] Failed to create platform admin:', err)
    return NextResponse.json({ error: 'Failed to create platform admin' }, { status: 500 })
  }
}
