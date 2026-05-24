import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const { id } = await params
  const body = await req.json()

  const deduction = await prisma.statutoryDeduction.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!deduction) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.statutoryDeduction.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.rate !== undefined ? { rate: body.rate } : {}),
      ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const { id } = await params
  const deduction = await prisma.statutoryDeduction.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!deduction) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.statutoryDeduction.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
