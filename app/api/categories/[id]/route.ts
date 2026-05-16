import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'

interface RouteParams { params: Promise<{ id: string }> }

/** GET /api/categories/[id] */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const { id } = await params

    const category = await prisma.category.findFirst({
      where: { id, tenantId: context!.tenantId },
    })

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const items = await prisma.item.findMany({
      where: applyBranchScope(
        { tenantId: context!.tenantId, categoryId: id },
        context!
      ),
      select: { id: true, name: true, quantity: true, sellingPrice: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      ...category,
      items,
      _count: {
        items: items.length,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

/** PUT /api/categories/[id] */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_items')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    const existing = await prisma.category.findFirst({ where: { id, tenantId: context!.tenantId } })
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    if (body.name) {
      const duplicate = await prisma.category.findFirst({
        where: { tenantId: context!.tenantId, name: { equals: body.name.trim(), mode: 'insensitive' }, NOT: { id } },
      })
      if (duplicate) return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
      include: { _count: { select: { items: true } } },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

/** DELETE /api/categories/[id] */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'delete_items')
    if (!authorized) return permError!

    const { id } = await params

    const category = await prisma.category.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { _count: { select: { items: true } } },
    })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const visibleItemsWhere = applyBranchScope(
      {
        tenantId: context!.tenantId,
        categoryId: id,
      },
      context!
    )

    const visibleItemCount = await prisma.item.count({ where: visibleItemsWhere })

    if (isBranchFilterActive(context!) && category._count.items > visibleItemCount) {
      return NextResponse.json(
        {
          error:
            'This category is still used by items outside the selected branch. Switch to All Branches before deleting it.',
        },
        { status: 409 }
      )
    }

    if (visibleItemCount > 0) {
      await prisma.item.updateMany({
        where: visibleItemsWhere,
        data: { categoryId: null },
      })
    }

    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
