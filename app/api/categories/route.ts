import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/categories
 * List all product categories for the current tenant.
 * Returns each category with a count of items assigned to it.
 */
export async function GET() {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error!

    const categories = await prisma.category.findMany({
      where: { tenantId: tenantId! },
      include: { _count: { select: { items: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json(categories)
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
    const { error, tenantId, user } = await requireTenant()
    if (error) return error!

    const { authorized, error: permError } = requirePermission(user!.role, 'create_items')
    if (!authorized) return permError!

    const body = await req.json()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const existing = await prisma.category.findFirst({
      where: { tenantId: tenantId!, name: { equals: body.name.trim(), mode: 'insensitive' } },
    })
    if (existing) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    const category = await prisma.category.create({
      data: {
        tenantId: tenantId!,
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
