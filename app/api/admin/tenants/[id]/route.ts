import { NextResponse } from 'next/server'
import { TenantStatus } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { context, error } = await requireSuperAdmin()
    if (error) return error

    const { id } = await params
    const body = await req.json()

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const updates: {
      name?: string
      phone?: string | null
      status?: TenantStatus
    } = {}

    const changedFields: Record<string, { from: string | null; to: string | null }> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
      }

      const nextName = body.name.trim()
      updates.name = nextName

      if (tenant.name !== nextName) {
        changedFields.name = { from: tenant.name, to: nextName }
      }
    }

    if (body.phone !== undefined) {
      if (body.phone !== null && typeof body.phone !== 'string') {
        return NextResponse.json({ error: 'Phone must be a string or null' }, { status: 400 })
      }

      const nextPhone = typeof body.phone === 'string' ? body.phone.trim() || null : null
      updates.phone = nextPhone

      if ((tenant.phone ?? null) !== nextPhone) {
        changedFields.phone = { from: tenant.phone ?? null, to: nextPhone }
      }
    }

    if (body.status !== undefined) {
      if (!Object.values(TenantStatus).includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }

      const nextStatus = body.status as TenantStatus
      updates.status = nextStatus

      if (tenant.status !== nextStatus) {
        changedFields.status = { from: tenant.status, to: nextStatus }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No tenant fields to update' }, { status: 400 })
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
      },
    })

    if (Object.keys(changedFields).length > 0) {
      await prisma.platformAuditLog.create({
        data: {
          actorEmail: context!.email,
          action: 'tenant.updated',
          entity: 'Tenant',
          entityId: updatedTenant.id,
          details: changedFields,
        },
      })
    }

    return NextResponse.json(updatedTenant)
  } catch (err) {
    console.error('[admin/tenants/:id PATCH] Failed:', err)
    return NextResponse.json({ error: 'Failed to update tenant details' }, { status: 500 })
  }
}
