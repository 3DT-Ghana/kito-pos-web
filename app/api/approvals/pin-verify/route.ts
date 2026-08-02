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

// A 4-digit PIN is only a 10k keyspace, so an unthrottled endpoint is
// brute-forceable by any authenticated cashier. Track failures per terminal.
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000
const attempts = new Map<string, { count: number; firstAt: number }>()

function checkRateLimit(key: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.firstAt > LOCKOUT_MS) {
    return { blocked: false, retryAfter: 0 }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfter: Math.ceil((LOCKOUT_MS - (now - entry.firstAt)) / 1000) }
  }
  return { blocked: false, retryAfter: 0 }
}

function recordFailure(key: string) {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.firstAt > LOCKOUT_MS) {
    attempts.set(key, { count: 1, firstAt: now })
  } else {
    entry.count++
  }
  // Opportunistic cleanup so the map cannot grow without bound
  if (attempts.size > 500) {
    for (const [k, v] of attempts) {
      if (now - v.firstAt > LOCKOUT_MS) attempts.delete(k)
    }
  }
}
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const rateKey = `${context!.tenantId}:${context!.user.id}`
    const limit = checkRateLimit(rateKey)
    if (limit.blocked) {
      return NextResponse.json(
        {
          valid: false,
          error: `Too many incorrect PIN attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s), or have a manager approve from the Approvals page.`,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      )
    }

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

      attempts.delete(rateKey) // successful approval clears the counter
      return NextResponse.json({
        valid: true,
        approverId: candidate.id,
        approverName: candidate.name,
        grant,
      })
    }

    recordFailure(rateKey)
    return invalidResponse
  } catch (err) {
    console.error('PIN verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
