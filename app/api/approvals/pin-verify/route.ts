import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { getOperationalBranchId, requireBranchAccess } from '@/lib/branch/server'
import {
  canViewAllBranchesForRole,
  hasPermission,
  type Role,
} from '@/lib/permissions/rbac'
import { createApprovalGrant } from '@/lib/approvals/inlineGrant'

/**
 * POST /api/approvals/pin-verify
 * Verify a manager's password (used as POS inline PIN) and issue
 * a short-lived approval grant for the current tenant + branch.
 *
 * Body:
 *   email:    string
 *   password: string
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const manager = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), tenantId: context!.tenantId },
      select: { id: true, name: true, role: true, password: true, branchId: true },
    })

    const invalidResponse = NextResponse.json(
      { valid: false, error: 'Invalid approval credentials' },
      { status: 200 }
    )

    const operationalBranchId = getOperationalBranchId(context!)
    if (context!.branchesEnabled && !operationalBranchId) {
      return NextResponse.json(
        { valid: false, error: 'Select a branch before requesting approval.' },
        { status: 200 }
      )
    }

    if (!manager) return invalidResponse

    const passwordMatch = await compare(password, manager.password)
    if (!passwordMatch) return invalidResponse

    const canApprove = hasPermission(
      {
        role: manager.role as Role,
        rolePermissions: context!.rolePermissions,
      },
      'approve_transactions'
    )
    if (!canApprove) return invalidResponse

    const branchAllowed = !context!.branchesEnabled ||
      canViewAllBranchesForRole(manager.role as Parameters<typeof canViewAllBranchesForRole>[0]) ||
      manager.branchId === operationalBranchId
    if (!branchAllowed) return invalidResponse

    const grant = createApprovalGrant({
      tenantId: context!.tenantId,
      branchId: operationalBranchId,
      approverId: manager.id,
      approverName: manager.name,
      scope: 'SALE',
    })

    return NextResponse.json({
      valid: true,
      approverId: manager.id,
      approverName: manager.name,
      grant,
    })
  } catch (err) {
    console.error('PIN verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
