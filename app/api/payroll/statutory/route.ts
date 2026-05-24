import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requireTenantFeature } from '@/lib/tenant/features'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { DEFAULT_SSF_EMPLOYEE_RATE, DEFAULT_SSF_EMPLOYER_RATE } from '@/lib/payroll/compute'

const DEFAULTS = [
  { code: 'SSF_EMPLOYEE', name: 'SSF Employee Contribution', rate: DEFAULT_SSF_EMPLOYEE_RATE, appliesTo: 'BASIC' },
  { code: 'SSF_EMPLOYER', name: 'SSF Employer Contribution', rate: DEFAULT_SSF_EMPLOYER_RATE, appliesTo: 'BASIC' },
]

export async function GET() {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'view_payroll')
  if (!authorized) return permError!

  let deductions = await prisma.statutoryDeduction.findMany({
    where: { tenantId: context!.tenantId },
    orderBy: { code: 'asc' },
  })

  // Seed defaults if none configured yet
  if (deductions.length === 0) {
    await prisma.statutoryDeduction.createMany({
      data: DEFAULTS.map((d) => ({ ...d, tenantId: context!.tenantId })),
      skipDuplicates: true,
    })
    deductions = await prisma.statutoryDeduction.findMany({
      where: { tenantId: context!.tenantId },
      orderBy: { code: 'asc' },
    })
  }

  return NextResponse.json(deductions)
}

export async function POST(req: Request) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const body = await req.json()
  const { name, code, rate, appliesTo } = body

  if (!name || !code || rate === undefined) {
    return NextResponse.json({ error: 'name, code, and rate are required' }, { status: 400 })
  }

  const deduction = await prisma.statutoryDeduction.upsert({
    where: { tenantId_code: { tenantId: context!.tenantId, code } },
    create: { tenantId: context!.tenantId, name, code, rate, appliesTo: appliesTo ?? 'BASIC' },
    update: { name, rate, appliesTo: appliesTo ?? 'BASIC' },
  })

  return NextResponse.json(deduction, { status: 201 })
}
