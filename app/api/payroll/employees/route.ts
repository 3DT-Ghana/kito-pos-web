import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { EmploymentType, SsfTier } from '@prisma/client'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/payroll/employees  — List employees
 * POST /api/payroll/employees — Create employee
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const department  = searchParams.get('department')
    const activeOnly  = searchParams.get('activeOnly') !== 'false'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }
    if (activeOnly) where.isActive = true
    if (department) where.department = department

    const employees = await prisma.employee.findMany({
      where,
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ employees, total: employees.length })
  } catch (err) {
    console.error('Failed to fetch employees:', err)
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enablePayroll')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
    if (!authorized) return permError!

    const body = await req.json()

    if (!body.name?.trim())     return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!body.staffId?.trim())  return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 })
    if (!body.position?.trim()) return NextResponse.json({ error: 'Position is required' }, { status: 400 })

    const basicSalary = parseFloat(body.basicSalary)
    if (isNaN(basicSalary) || basicSalary < 0) {
      return NextResponse.json({ error: 'Basic salary must be a non-negative number' }, { status: 400 })
    }

    if (body.employmentType && !Object.values(EmploymentType).includes(body.employmentType)) {
      return NextResponse.json({ error: 'Invalid employment type' }, { status: 400 })
    }
    if (body.ssfTier && !Object.values(SsfTier).includes(body.ssfTier)) {
      return NextResponse.json({ error: 'Invalid SSF tier' }, { status: 400 })
    }
    if (body.ssfTier && body.ssfTier !== 'TIER1') {
      return NextResponse.json({ error: 'Payroll currently supports Tier 1 employees only' }, { status: 400 })
    }

    // Unique staffId per tenant
    const existing = await prisma.employee.findFirst({
      where: { tenantId: context!.tenantId, staffId: body.staffId.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: `Staff ID "${body.staffId}" is already in use` }, { status: 409 })
    }

    const employee = await prisma.employee.create({
      data: {
        tenantId:       context!.tenantId,
        staffId:        body.staffId.trim(),
        name:           body.name.trim(),
        email:          body.email?.trim() || null,
        phone:          body.phone?.trim() || null,
        position:       body.position.trim(),
        department:     body.department?.trim() || null,
        employmentType: (body.employmentType as EmploymentType) ?? 'FULL_TIME',
        basicSalary,
        ssfTier:        'TIER1',
        isExemptFromPAYE: Boolean(body.isExemptFromPAYE),
        bankName:       body.bankName?.trim() || null,
        bankBranch:     body.bankBranch?.trim() || null,
        accountNumber:  body.accountNumber?.trim() || null,
        hireDate:       body.hireDate ? new Date(body.hireDate) : new Date(),
      },
    })

    return NextResponse.json({ employee }, { status: 201 })
  } catch (err) {
    console.error('Failed to create employee:', err)
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}
