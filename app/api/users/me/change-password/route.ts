import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'

/**
 * POST /api/users/me/change-password
 * Allows any authenticated user to change their own password.
 * Requires the current password for verification.
 *
 * Body: { currentPassword: string; newPassword: string }
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const body = await req.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: context!.user.id },
      select: { password: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const valid = await compare(currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    const hashed = await hash(newPassword, 12)
    await prisma.user.update({
      where: { id: context!.user.id },
      data: { password: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Change password error:', err)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
