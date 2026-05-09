import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string }> }

/** GET /api/categories/[id] */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error!
    const { id } = await params

    const category = await prisma.category.findFirst({
      where: { id, tenantId: tenantId! },
      include: {
        _count: { select: { items: true } },
        items: {
          select: { id: true, name: true, quantity: true, sellingPrice: true },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    return NextResponse.json(category)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

/** PUT /api/categories/[id] */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(user!.role, 'create_items')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    const existing = await prisma.category.findFirst({ where: { id, tenantId: tenantId! } })
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    if (body.name) {
      const duplicate = await prisma.category.findFirst({
        where: { tenantId: tenantId!, name: { equals: body.name.trim(), mode: 'insensitive' }, NOT: { id } },
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
    const { error, tenantId, user } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(user!.role, 'delete_items')
    if (!authorized) return permError!

    const { id } = await params

    const category = await prisma.category.findFirst({
      where: { id, tenantId: tenantId! },
      include: { _count: { select: { items: true } } },
    })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    // Unassign items rather than blocking deletion
    if (category._count.items > 0) {
      await prisma.item.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
    }

    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
