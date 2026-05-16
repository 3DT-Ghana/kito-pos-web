import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'

/**
 * Branches API
 *
 * GET  /api/branches - List all branches for the tenant
 * POST /api/branches - Create a new branch (OWNER only)
 */

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const visibleBranchIds = context!.branches.map((branch) => branch.id)
    const branches = await prisma.branch.findMany({
      where: {
        tenantId: context!.tenantId,
        ...(visibleBranchIds.length > 0 ? { id: { in: visibleBranchIds } } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { users: true } },
      },
    })

    return NextResponse.json({
      branches,
      context: {
        branchesEnabled: context!.branchesEnabled,
        currentBranchId: context!.currentBranchId,
        assignedBranchId: context!.assignedBranchId,
        canViewAllBranches: context!.canViewAllBranches,
        isBranchLocked: context!.isBranchLocked,
      },
    })
  } catch (err) {
    console.error('Failed to fetch branches:', err)
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const body = await req.json()

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    // If this is the first branch, make it the default
    const duplicate = await prisma.branch.findFirst({
      where: {
        tenantId: context!.tenantId,
        name: {
          equals: body.name.trim(),
          mode: 'insensitive',
        },
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json({ error: 'A branch with this name already exists' }, { status: 409 })
    }

    const existingCount = await prisma.branch.count({ where: { tenantId: context!.tenantId } })
    const isDefault = existingCount === 0 ? true : (body.isDefault ?? false)

    // If setting as default, unset any current default
    if (isDefault) {
      await prisma.branch.updateMany({
        where: { tenantId: context!.tenantId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const branch = await prisma.branch.create({
      data: {
        tenantId: context!.tenantId,
        name: body.name.trim(),
        address: body.address?.trim() || null,
        phone: body.phone?.trim() || null,
        isDefault,
      },
    })

    return NextResponse.json(branch, { status: 201 })
  } catch (err) {
    console.error('Failed to create branch:', err)
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 })
  }
}
