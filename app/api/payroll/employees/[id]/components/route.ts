import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
  if (!authorized) return permError!

  const { id: employeeId } = await params

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: context!.tenantId } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const assignments = await prisma.employeePayrollComponent.findMany({
    where: { employeeId },
    include: { component: true },
    orderBy: { effectiveFrom: 'desc' },
  })

  return NextResponse.json(assignments)
}

export async function POST(req: Request, { params }: RouteParams) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const { id: employeeId } = await params
  const body = await req.json()
  const { componentId, amount, effectiveFrom, effectiveTo } = body

  if (!componentId || amount === undefined) {
    return NextResponse.json({ error: 'componentId and amount are required' }, { status: 400 })
  }

  const [employee, component] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId, tenantId: context!.tenantId } }),
    prisma.payrollComponent.findFirst({ where: { id: componentId, tenantId: context!.tenantId } }),
  ])
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!component) return NextResponse.json({ error: 'Component not found' }, { status: 404 })

  const assignment = await prisma.employeePayrollComponent.create({
    data: {
      employeeId,
      componentId,
      amount,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    },
    include: { component: true },
  })

  return NextResponse.json(assignment, { status: 201 })
}
