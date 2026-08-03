import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { requireTenantFeature } from '@/lib/tenant/features'
import { prisma } from '@/lib/db/prisma'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  // Was the only payroll handler with neither a feature gate nor a permission
  // check — any authenticated user of any role could delete departments.
  const featureError = requireTenantFeature(context!.features, 'enablePayroll')
  if (featureError) return featureError

  const { authorized, error: permError } = requirePermission(context!, 'manage_employees')
  if (!authorized) return permError!

  const { id } = await params

  const dept = await prisma.payrollDepartment.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!dept) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Employees reference the department by name, so deleting one silently
  // orphaned the label on every employee assigned to it.
  const assigned = await prisma.employee.count({
    where: { tenantId: context!.tenantId, department: dept.name },
  })
  if (assigned > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${dept.name}" — ${assigned} employee(s) are assigned to it. Reassign them first.`,
      },
      { status: 409 }
    )
  }

  await prisma.payrollDepartment.deleteMany({ where: { id, tenantId: context!.tenantId } })
  return NextResponse.json({ success: true })
}
