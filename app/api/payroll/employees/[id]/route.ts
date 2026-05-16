import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { EmploymentType, SsfTier } from '@prisma/client'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
    if (!authorized) return permError!

    const { id } = await params
    const employee = await prisma.employee.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        payrollLines: {
          include: { payrollRun: { select: { periodYear: true, periodMonth: true, status: true } } },
          orderBy: { payrollRun: { periodYear: 'desc' } },
          take: 12,
        },
      },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    return NextResponse.json(employee)
  } catch (err) {
    console.error('Failed to fetch employee:', err)
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    const employee = await prisma.employee.findFirst({ where: { id, tenantId: context!.tenantId } })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    if (body.employmentType && !Object.values(EmploymentType).includes(body.employmentType)) {
      return NextResponse.json({ error: 'Invalid employment type' }, { status: 400 })
    }
    if (body.ssfTier && !Object.values(SsfTier).includes(body.ssfTier)) {
      return NextResponse.json({ error: 'Invalid SSF tier' }, { status: 400 })
    }
    if (body.ssfTier && body.ssfTier !== 'TIER1') {
      return NextResponse.json({ error: 'Payroll currently supports Tier 1 employees only' }, { status: 400 })
    }
    if (body.basicSalary !== undefined) {
      const v = parseFloat(body.basicSalary)
      if (isNaN(v) || v < 0) return NextResponse.json({ error: 'Invalid basic salary' }, { status: 400 })
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(body.name      !== undefined && { name:      body.name.trim() }),
        ...(body.email     !== undefined && { email:     body.email?.trim() || null }),
        ...(body.phone     !== undefined && { phone:     body.phone?.trim() || null }),
        ...(body.position  !== undefined && { position:  body.position.trim() }),
        ...(body.department !== undefined && { department: body.department?.trim() || null }),
        ...(body.employmentType !== undefined && { employmentType: body.employmentType as EmploymentType }),
        ...(body.basicSalary  !== undefined && { basicSalary: parseFloat(body.basicSalary) }),
        ...(body.ssfTier      !== undefined && { ssfTier: 'TIER1' as SsfTier }),
        ...(body.isExemptFromPAYE !== undefined && { isExemptFromPAYE: Boolean(body.isExemptFromPAYE) }),
        ...(body.bankName     !== undefined && { bankName:     body.bankName?.trim() || null }),
        ...(body.bankBranch   !== undefined && { bankBranch:   body.bankBranch?.trim() || null }),
        ...(body.accountNumber !== undefined && { accountNumber: body.accountNumber?.trim() || null }),
        ...(body.isActive     !== undefined && { isActive: Boolean(body.isActive) }),
        ...(body.endDate      !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update employee:', err)
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error
    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
    if (!authorized) return permError!

    const { id } = await params
    const employee = await prisma.employee.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { _count: { select: { payrollLines: true } } },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    if (employee._count.payrollLines > 0) {
      return NextResponse.json({ error: 'Cannot delete employee with payroll history. Deactivate instead.' }, { status: 409 })
    }

    await prisma.employee.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete employee:', err)
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 })
  }
}
