import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { hasPermission, type Role } from '@/lib/permissions/rbac'

/**
 * POST /api/users/me/approval-pin
 * Set or update the caller's approval PIN (4–6 digits).
 * Only users with approve_transactions permission can set a PIN.
 *
 * DELETE /api/users/me/approval-pin
 * Clear the caller's approval PIN.
 */

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const canApprove = hasPermission(
      { role: context!.user.role as Role, rolePermissions: context!.rolePermissions },
      'approve_transactions'
    )
    if (!canApprove) {
      return NextResponse.json({ error: 'Only users with approval permission can set a PIN' }, { status: 403 })
    }

    const body = await req.json()
    const { pin } = body

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })
    }

    const hashed = await hash(pin, 10)
    await prisma.user.update({
      where: { id: context!.user.id },
      data: { approvalPin: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Set approval PIN error:', err)
    return NextResponse.json({ error: 'Failed to set PIN' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    await prisma.user.update({
      where: { id: context!.user.id },
      data: { approvalPin: null },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Clear approval PIN error:', err)
    return NextResponse.json({ error: 'Failed to clear PIN' }, { status: 500 })
  }
}
