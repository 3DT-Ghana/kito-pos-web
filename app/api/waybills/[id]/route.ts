import { NextResponse } from 'next/server'
import { WaybillStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { waybillSelect } from '@/lib/waybills/server'
import { sendWhatsApp, buildWhatsAppWaybillDispatch } from '@/lib/whatsapp/meta'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_waybills')
    if (!authorized) return permError!

    const { id } = await params
    const waybill = await prisma.waybill.findFirst({
      where: { id, tenantId: context!.tenantId },
      select: waybillSelect,
    })

    if (!waybill) return NextResponse.json({ error: 'Waybill not found' }, { status: 404 })
    return NextResponse.json(waybill)
  } catch (err) {
    console.error('[waybills/:id GET]', err)
    return NextResponse.json({ error: 'Failed to fetch waybill' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_waybills')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()
    const action = body.action ? String(body.action) : null

    const waybill = await prisma.waybill.findFirst({
      where: { id, tenantId: context!.tenantId },
      select: { id: true, status: true },
    })
    if (!waybill) return NextResponse.json({ error: 'Waybill not found' }, { status: 404 })

    // ── Status transitions ──────────────────────────────────────────────
    if (action === 'dispatch') {
      if (waybill.status !== WaybillStatus.DRAFT) {
        return NextResponse.json({ error: 'Only draft waybills can be dispatched' }, { status: 409 })
      }
      const updated = await prisma.waybill.update({
        where: { id },
        data: {
          status: WaybillStatus.DISPATCHED,
          dispatchedAt: new Date(),
          dispatchedById: context!.user.id,
          ...(body.driverName    ? { driverName:    String(body.driverName).trim() }    : {}),
          ...(body.vehicleNumber ? { vehicleNumber: String(body.vehicleNumber).trim() } : {}),
          ...(body.carrierName   ? { carrierName:   String(body.carrierName).trim() }   : {}),
        },
        select: waybillSelect,
      })

      // Send WhatsApp dispatch notification to consignee (fire-and-forget)
      if (updated.consigneePhone) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: context!.tenantId },
          select: { name: true, enableWhatsApp: true, metaWabaToken: true, metaWabaPhoneNumberId: true },
        })
        if (tenant?.enableWhatsApp && tenant.metaWabaToken && tenant.metaWabaPhoneNumberId) {
          const message = buildWhatsAppWaybillDispatch({
            businessName: tenant.name,
            consigneeName: updated.consigneeName,
            waybillNumber: updated.waybillNumber,
            itemCount: updated.items.length,
            driverName: updated.driverName,
            vehicleNumber: updated.vehicleNumber,
            consigneeAddress: updated.consigneeAddress,
          })
          sendWhatsApp(
            { token: tenant.metaWabaToken, phoneNumberId: tenant.metaWabaPhoneNumberId },
            updated.consigneePhone,
            message,
          ).catch(() => {})
        }
      }

      return NextResponse.json(updated)
    }

    if (action === 'deliver') {
      if (waybill.status !== WaybillStatus.DISPATCHED) {
        return NextResponse.json({ error: 'Only dispatched waybills can be marked delivered' }, { status: 409 })
      }
      const receivedBy = body.receivedBy ? String(body.receivedBy).trim() : null
      const updated = await prisma.waybill.update({
        where: { id },
        data: {
          status: WaybillStatus.DELIVERED,
          deliveredAt: new Date(),
          deliveredById: context!.user.id,
          ...(receivedBy ? { receivedBy } : {}),
        },
        select: waybillSelect,
      })
      return NextResponse.json(updated)
    }

    if (action === 'cancel') {
      if (waybill.status === WaybillStatus.DELIVERED) {
        return NextResponse.json({ error: 'Delivered waybills cannot be cancelled' }, { status: 409 })
      }
      if (waybill.status === WaybillStatus.CANCELLED) {
        return NextResponse.json({ error: 'Waybill is already cancelled' }, { status: 409 })
      }
      const updated = await prisma.waybill.update({
        where: { id },
        data: { status: WaybillStatus.CANCELLED },
        select: waybillSelect,
      })
      return NextResponse.json(updated)
    }

    // ── Field edits (DRAFT only) ────────────────────────────────────────
    if (waybill.status !== WaybillStatus.DRAFT) {
      return NextResponse.json({ error: 'Only draft waybills can be edited' }, { status: 409 })
    }

    const updated = await prisma.waybill.update({
      where: { id },
      data: {
        ...(body.shipperName      !== undefined ? { shipperName:      String(body.shipperName).trim() }      : {}),
        ...(body.shipperAddress   !== undefined ? { shipperAddress:   String(body.shipperAddress).trim() || null }   : {}),
        ...(body.shipperPhone     !== undefined ? { shipperPhone:     String(body.shipperPhone).trim() || null }     : {}),
        ...(body.consigneeName    !== undefined ? { consigneeName:    String(body.consigneeName).trim() }    : {}),
        ...(body.consigneeAddress !== undefined ? { consigneeAddress: String(body.consigneeAddress).trim() } : {}),
        ...(body.consigneePhone   !== undefined ? { consigneePhone:   String(body.consigneePhone).trim() || null }   : {}),
        ...(body.driverName       !== undefined ? { driverName:       String(body.driverName).trim() || null }       : {}),
        ...(body.vehicleNumber    !== undefined ? { vehicleNumber:    String(body.vehicleNumber).trim() || null }    : {}),
        ...(body.carrierName      !== undefined ? { carrierName:      String(body.carrierName).trim() || null }      : {}),
        ...(body.notes            !== undefined ? { notes:            String(body.notes).trim() || null }            : {}),
      },
      select: waybillSelect,
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[waybills/:id PATCH]', err)
    return NextResponse.json({ error: 'Failed to update waybill' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'delete_waybills')
    if (!authorized) return permError!

    const { id } = await params
    const waybill = await prisma.waybill.findFirst({
      where: { id, tenantId: context!.tenantId },
      select: { id: true, status: true },
    })
    if (!waybill) return NextResponse.json({ error: 'Waybill not found' }, { status: 404 })
    if (waybill.status !== WaybillStatus.DRAFT && waybill.status !== WaybillStatus.CANCELLED) {
      return NextResponse.json({ error: 'Only draft or cancelled waybills can be deleted' }, { status: 409 })
    }

    // Scope the delete by tenant too rather than trusting the prior read
    await prisma.waybill.deleteMany({ where: { id, tenantId: context!.tenantId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[waybills/:id DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete waybill' }, { status: 500 })
  }
}
