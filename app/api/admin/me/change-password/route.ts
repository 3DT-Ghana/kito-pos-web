import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'

export async function POST(req: Request) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const body = await req.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'currentPassword and newPassword are required' },
        { status: 400 }
      )
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const admin = await prisma.platformAdmin.findUnique({
      where: { id: context!.platformAdminId },
      select: { passwordHash: true },
    })

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }

    const valid = await compare(currentPassword, admin.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    const hashed = await hash(newPassword, 12)
    await prisma.platformAdmin.update({
      where: { id: context!.platformAdminId },
      data: { passwordHash: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/me/change-password] error:', err)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
