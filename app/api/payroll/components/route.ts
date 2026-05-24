import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import type { PayrollComponentType } from '@prisma/client'

export async function GET() {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
  if (!authorized) return permError!

  const components = await prisma.payrollComponent.findMany({
    where: { tenantId: context!.tenantId },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(components)
}

export async function POST(req: Request) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const body = await req.json()
  const { name, type, subType, isTaxable, isBeforeTax } = body

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (!['ALLOWANCE', 'DEDUCTION'].includes(type)) {
    return NextResponse.json({ error: 'type must be ALLOWANCE or DEDUCTION' }, { status: 400 })
  }

  const component = await prisma.payrollComponent.create({
    data: {
      tenantId: context!.tenantId,
      name,
      type: type as PayrollComponentType,
      subType: subType ?? null,
      isTaxable: type === 'ALLOWANCE' ? Boolean(isTaxable) : false,
      isBeforeTax: type === 'DEDUCTION' ? (isBeforeTax !== false) : false,
    },
  })

  return NextResponse.json(component, { status: 201 })
}
