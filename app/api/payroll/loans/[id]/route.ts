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

  const loan = await prisma.employeeLoan.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.employeeLoan.update({
    where: { id },
    data: {
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.monthlyDeduction !== undefined ? { monthlyDeduction: body.monthlyDeduction } : {}),
      ...(body.balanceAmount !== undefined ? { balanceAmount: body.balanceAmount } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
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

  const loan = await prisma.employeeLoan.findFirst({
    where: { id, tenantId: context!.tenantId },
    include: { _count: { select: { repayments: true } } },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (loan._count.repayments > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a loan with repayment history. Close it instead.' },
      { status: 409 }
    )
  }

  await prisma.employeeLoan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
