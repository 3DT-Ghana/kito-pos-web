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

    // A whitespace-only name is truthy, so it skipped the duplicate check above
    // and saved as an empty string — leaving a blank entry in the branch switcher.
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
      return NextResponse.json({ error: 'Branch name cannot be empty' }, { status: 400 })
    }

    // If setting as default, unset previous default
    if (body.isDefault) {
      await prisma.branch.updateMany({
        where: { tenantId: context!.tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    } else if (body.isDefault === false && branch.isDefault) {
      // Unsetting the current default left the tenant with none. That silently
      // disabled the "cannot delete the default branch" guard, allowing every
      // branch to be deleted down to the last one. Promote another branch
      // instead of allowing zero.
      return NextResponse.json(
        {
          error: 'A business must always have one default branch. Set another branch as the default instead of clearing this one.',
        },
        { status: 400 }
      )
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
      // Branch has no foreign keys to any of these, so nothing at the database
      // level stops a delete. Omitting them left quotations, waybills and
      // purchase orders pointing at a branch that no longer exists — and since
      // scoping is strict equality, permanently invisible from every branch.
      quotationsCount,
      purchaseOrdersCount,
      waybillsCount,
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
      prisma.quotation.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.purchaseOrder.count({ where: { tenantId: context!.tenantId, branchId: id } }),
      prisma.waybill.count({ where: { tenantId: context!.tenantId, branchId: id } }),
    ])

    const linkedRecords: [string, number][] = [
      ['items', itemsCount],
      ['sales', salesCount],
      ['purchases', purchasesCount],
      ['stock adjustments', adjustmentsCount],
      ['expenses', expensesCount],
      ['till sessions', registersCount],
      ['customer payments', customerPaymentsCount],
      ['supplier payments', supplierPaymentsCount],
      ['outgoing transfers', transferOutCount],
      ['incoming transfers', transferInCount],
      ['quotations', quotationsCount],
      ['purchase orders', purchaseOrdersCount],
      ['waybills', waybillsCount],
    ]
    const blocking = linkedRecords.filter(([, count]) => count > 0)

    if (blocking.length > 0) {
      return NextResponse.json(
        {
          // Naming what blocks the delete is the difference between an
          // actionable message and a dead end, since none of these have a
          // foreign key that would name itself in an error.
          error: `Cannot delete this branch — it still has ${blocking
            .map(([label, count]) => `${count} ${label}`)
            .join(', ')}. Move or clear that data first.`,
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
