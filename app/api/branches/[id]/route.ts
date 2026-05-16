import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'

/**
 * /api/branches/[id]
 *
 * GET    - Get single branch
 * PUT    - Update branch (OWNER only)
 * DELETE - Delete branch (OWNER only, cannot delete default or only branch)
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const { id } = await params

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        users: { select: { id: true, name: true, role: true, email: true } },
        _count: { select: { users: true } },
      },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    return NextResponse.json(branch)
  } catch (err) {
    console.error('Failed to fetch branch:', err)
    return NextResponse.json({ error: 'Failed to fetch branch' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId: context!.tenantId },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    if (body.name?.trim()) {
      const duplicate = await prisma.branch.findFirst({
        where: {
          tenantId: context!.tenantId,
          id: { not: id },
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
    }

    // If setting as default, unset previous default
    if (body.isDefault) {
      await prisma.branch.updateMany({
        where: { tenantId: context!.tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.address !== undefined && { address: body.address?.trim() || null }),
        ...(body.phone !== undefined && { phone: body.phone?.trim() || null }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update branch:', err)
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const { id } = await params

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId: context!.tenantId },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    if (branch.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default branch. Set another branch as default first.' },
        { status: 400 }
      )
    }

    const totalBranches = await prisma.branch.count({ where: { tenantId: context!.tenantId } })
    if (totalBranches <= 1) {
      return NextResponse.json({ error: 'Cannot delete the only branch' }, { status: 400 })
    }

    const [
      itemsCount,
      salesCount,
      purchasesCount,
      adjustmentsCount,
      expensesCount,
      registersCount,
      customerPaymentsCount,
      supplierPaymentsCount,
      transferOutCount,
      transferInCount,
    ] = await Promise.all([
      prisma.item.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.sale.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.purchase.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.stockAdjustment.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.expense.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.cashRegister.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.customerPayment.count({
        where: {
          tenantId: context!.tenantId,
          branchId: id,
        },
      }),
      prisma.supplierPayment.count({
        where: {
          tenantId: context!.tenantId,
          branchId: id,
        },
      }),
      prisma.stockTransfer.count({
        where: {
          tenantId: context!.tenantId,
          fromBranchId: id,
        },
      }),
      prisma.stockTransfer.count({
        where: {
          tenantId: context!.tenantId,
          toBranchId: id,
        },
      }),
    ])

    const linkedRecordsCount =
      itemsCount +
      salesCount +
      purchasesCount +
      adjustmentsCount +
      expensesCount +
      registersCount +
      customerPaymentsCount +
      supplierPaymentsCount +
      transferOutCount +
      transferInCount

    if (linkedRecordsCount > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete a branch that already has transactions, transfers, or inventory. Move or clear the data first.',
        },
        { status: 409 }
      )
    }

    // Unassign users from this branch before deleting
    await prisma.user.updateMany({
      where: { tenantId: context!.tenantId, branchId: id },
      data: { branchId: null },
    })

    await prisma.branch.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete branch:', err)
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
  }
}
