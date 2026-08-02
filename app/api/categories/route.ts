import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import {
  applyBranchScope,
  isBranchFilterActive,
  requireBranchAccess,
} from '@/lib/branch/server'

/**
 * GET /api/categories
 * List all product categories for the current tenant.
 * Returns each category with a count of items assigned to it.
 */
export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_items')
    if (!authorized) return permError!

    if (!isBranchFilterActive(context!)) {
      const categories = await prisma.category.findMany({
        where: { tenantId: context!.tenantId },
        include: { _count: { select: { items: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })

      return NextResponse.json(categories)
    }

    const categories = await prisma.category.findMany({
      where: { tenantId: context!.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    const counts = await prisma.item.groupBy({
      by: ['categoryId'],
      where: applyBranchScope(
        {
          tenantId: context!.tenantId,
          categoryId: { in: categories.map((category) => category.id) },
        },
        context!
      ),
      _count: { _all: true },
    })

    const countMap = new Map(
      counts
        .filter((entry) => entry.categoryId)
        .map((entry) => [entry.categoryId as string, entry._count._all])
    )

    return NextResponse.json(
      categories.map((category) => ({
        ...category,
        _count: {
          items: countMap.get(category.id) ?? 0,
        },
      }))
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

/**
 * POST /api/categories
 * Create a new product category.
 * Requires: create_items permission (category management is part of inventory).
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'create_items')
    if (!authorized) return permError!

    const body = await req.json()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const existing = await prisma.category.findFirst({
      where: { tenantId: context!.tenantId, name: { equals: body.name.trim(), mode: 'insensitive' } },
    })
    if (existing) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    const category = await prisma.category.create({
      data: {
        tenantId: context!.tenantId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        color: body.color || '#6366f1',
        icon: body.icon || '📦',
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      },
      include: { _count: { select: { items: true } } },
    })

    return NextResponse.json(category, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
