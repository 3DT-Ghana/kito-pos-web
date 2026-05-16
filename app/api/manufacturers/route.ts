import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

/**
 * Manufacturers API Routes
 *
 * GET /api/manufacturers - List all manufacturers for current tenant
 * POST /api/manufacturers - Create new manufacturer
 */

/**
 * GET /api/manufacturers
 * List all manufacturers for the current tenant
 */
export async function GET() {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error!

    const manufacturers = await prisma.manufacturer.findMany({
      where: { tenantId: tenantId! },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(manufacturers)
  } catch (err) {
    console.error('Failed to fetch manufacturers:', err)
    return NextResponse.json(
      { error: 'Failed to fetch manufacturers' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/manufacturers
 * Create a new manufacturer
 * Requires: manage_manufacturers permission
 */
export async function POST(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Check permission
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'manage_manufacturers'
    )
    if (!authorized) return permError!

    const body = await req.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Manufacturer name is required' },
        { status: 400 }
      )
    }

    // Check for duplicate manufacturer name within tenant
    const existing = await prisma.manufacturer.findFirst({
      where: {
        tenantId,
        name: {
          equals: body.name,
          mode: 'insensitive' as const,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A manufacturer with this name already exists' },
        { status: 409 }
      )
    }

    // Create manufacturer
    const manufacturer = await prisma.manufacturer.create({
      data: {
        tenantId,
        name: body.name.trim(),
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    })

    return NextResponse.json(manufacturer, { status: 201 })
  } catch (err) {
    console.error('Failed to create manufacturer:', err)
    return NextResponse.json(
      { error: 'Failed to create manufacturer' },
      { status: 500 }
    )
  }
}
