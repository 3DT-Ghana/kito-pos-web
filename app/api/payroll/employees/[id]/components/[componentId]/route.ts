import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string; componentId: string }> }

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const { id: employeeId, componentId } = await params
  const body = await req.json()

  const assignment = await prisma.employeePayrollComponent.findFirst({
    where: { id: componentId, employeeId, employee: { tenantId: context!.tenantId } },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.employeePayrollComponent.update({
    where: { id: componentId },
    data: {
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.effectiveFrom !== undefined ? { effectiveFrom: new Date(body.effectiveFrom) } : {}),
      ...(body.effectiveTo !== undefined ? { effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null } : {}),
    },
    include: { component: true },
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

  const { id: employeeId, componentId } = await params

  const assignment = await prisma.employeePayrollComponent.findFirst({
    where: { id: componentId, employeeId, employee: { tenantId: context!.tenantId } },
  })
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.employeePayrollComponent.delete({ where: { id: componentId } })
  return NextResponse.json({ ok: true })
}
