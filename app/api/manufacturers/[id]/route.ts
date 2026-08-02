import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * Manufacturer Detail API Routes
 *
 * GET /api/manufacturers/[id] - Get manufacturer by ID
 * PUT /api/manufacturers/[id] - Update manufacturer
 * DELETE /api/manufacturers/[id] - Delete manufacturer
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/manufacturers/[id]
 * Get a specific manufacturer
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Returns per-item quantities and selling prices — gate the read
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'view_items'
    )
    if (!authorized) return permError!

    const { id } = await params

    const manufacturer = await prisma.manufacturer.findFirst({
      where: {
        id,
        tenantId, // Ensure tenant isolation
      },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            sellingPrice: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    })

    if (!manufacturer) {
      return NextResponse.json(
        { error: 'Manufacturer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(manufacturer)
  } catch (err) {
    console.error('Failed to fetch manufacturer:', err)
    return NextResponse.json(
      { error: 'Failed to fetch manufacturer' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/manufacturers/[id]
 * Update a manufacturer
 * Requires: manage_manufacturers permission
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Check permission
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'manage_manufacturers'
    )
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    // Validate
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Manufacturer name is required' },
        { status: 400 }
      )
    }

    // Check manufacturer exists and belongs to tenant
    const existing = await prisma.manufacturer.findFirst({
      where: { id, tenantId: tenantId! },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Manufacturer not found' },
        { status: 404 }
      )
    }

    // Check for duplicate name (excluding current manufacturer)
    const duplicate = await prisma.manufacturer.findFirst({
      where: {
        tenantId,
        name: {
          equals: body.name.trim(),
          mode: 'insensitive' as const,
        },
        id: { not: id },
      },
    })

    if (duplicate) {
      return NextResponse.json(
        { error: 'A manufacturer with this name already exists' },
        { status: 409 }
      )
    }

    // Update manufacturer
    const manufacturer = await prisma.manufacturer.update({
      where: { id },
      data: {
        name: body.name.trim(),
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    })

    return NextResponse.json(manufacturer)
  } catch (err) {
    console.error('Failed to update manufacturer:', err)
    return NextResponse.json(
      { error: 'Failed to update manufacturer' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/manufacturers/[id]
 * Delete a manufacturer
 * Requires: manage_manufacturers permission
 * Note: Cannot delete if manufacturer has items
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Check permission
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'manage_manufacturers'
    )
    if (!authorized) return permError!

    const { id } = await params

    // Check manufacturer exists and belongs to tenant
    const manufacturer = await prisma.manufacturer.findFirst({
      where: { id, tenantId: tenantId! },
      include: {
        _count: {
          select: { items: true },
        },
      },
    })

    if (!manufacturer) {
      return NextResponse.json(
        { error: 'Manufacturer not found' },
        { status: 404 }
      )
    }

    // Check if manufacturer has items
    if (manufacturer._count.items > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete manufacturer with existing items',
          itemCount: manufacturer._count.items,
        },
        { status: 409 }
      )
    }

    // Delete manufacturer
    await prisma.manufacturer.delete({
      where: { id },
    })

    return NextResponse.json(
      { message: 'Manufacturer deleted successfully' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Failed to delete manufacturer:', err)
    return NextResponse.json(
      { error: 'Failed to delete manufacturer' },
      { status: 500 }
    )
  }
}
