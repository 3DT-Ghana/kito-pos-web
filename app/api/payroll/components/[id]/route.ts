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

  const component = await prisma.payrollComponent.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!component) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.payrollComponent.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subType !== undefined ? { subType: body.subType } : {}),
      ...(body.isTaxable !== undefined && component.type === 'ALLOWANCE' ? { isTaxable: body.isTaxable } : {}),
      ...(body.isBeforeTax !== undefined && component.type === 'DEDUCTION' ? { isBeforeTax: body.isBeforeTax } : {}),
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

  const component = await prisma.payrollComponent.findFirst({
    where: { id, tenantId: context!.tenantId },
    include: { _count: { select: { assignments: { where: { isActive: true } } } } },
  })
  if (!component) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (component._count.assignments > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a component with active employee assignments. Deactivate it instead.' },
      { status: 409 }
    )
  }

  await prisma.payrollComponent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
