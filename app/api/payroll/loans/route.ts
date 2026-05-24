import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: Request) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
  if (!authorized) return permError!

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId')

  const loans = await prisma.employeeLoan.findMany({
    where: {
      tenantId: context!.tenantId,
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, staffId: true } },
      _count: { select: { repayments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(loans)
}

export async function POST(req: Request) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const body = await req.json()
  const { employeeId, description, principalAmount, monthlyDeduction, startDate, endDate } = body

  if (!employeeId || !description || !principalAmount || !monthlyDeduction || !startDate) {
    return NextResponse.json(
      { error: 'employeeId, description, principalAmount, monthlyDeduction, and startDate are required' },
      { status: 400 }
    )
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: context!.tenantId },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const loan = await prisma.employeeLoan.create({
    data: {
      tenantId: context!.tenantId,
      employeeId,
      description,
      principalAmount,
      balanceAmount: principalAmount,
      monthlyDeduction,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, staffId: true } },
    },
  })

  return NextResponse.json(loan, { status: 201 })
}
