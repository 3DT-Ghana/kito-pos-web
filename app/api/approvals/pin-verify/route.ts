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
 * Verify a manager's approval PIN (numeric, set on their profile).
 * Scans all eligible approvers in the tenant+branch and compares the PIN.
 *
 * Body:
 *   pin: string  (4–6 digit string)
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const body = await req.json()
    const { pin } = body

    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })
    }

    const invalidResponse = NextResponse.json(
      { valid: false, error: 'Invalid approval PIN' },
      { status: 200 }
    )

    const operationalBranchId = getOperationalBranchId(context!)
    if (context!.branchesEnabled && !operationalBranchId) {
      return NextResponse.json(
        { valid: false, error: 'Select a branch before requesting approval.' },
        { status: 200 }
      )
    }

    // Load all users in this tenant who have a PIN set
    const candidates = await prisma.user.findMany({
      where: {
        tenantId: context!.tenantId,
        approvalPin: { not: null },
      },
      select: { id: true, name: true, role: true, approvalPin: true, branchId: true },
    })

    // Find the first candidate whose PIN matches and has approve_transactions + correct branch
    for (const candidate of candidates) {
      const pinMatch = await compare(pin, candidate.approvalPin!)
      if (!pinMatch) continue

      const canApprove = hasPermission(
        { role: candidate.role as Role, rolePermissions: context!.rolePermissions },
        'approve_transactions'
      )
      if (!canApprove) continue

      const branchAllowed =
        !context!.branchesEnabled ||
        canViewAllBranchesForRole(candidate.role as Parameters<typeof canViewAllBranchesForRole>[0]) ||
        candidate.branchId === operationalBranchId
      if (!branchAllowed) continue

      const grant = createApprovalGrant({
        tenantId: context!.tenantId,
        branchId: operationalBranchId,
        approverId: candidate.id,
        approverName: candidate.name,
        scope: 'SALE',
      })

      return NextResponse.json({
        valid: true,
        approverId: candidate.id,
        approverName: candidate.name,
        grant,
      })
    }

    return invalidResponse
  } catch (err) {
    console.error('PIN verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
