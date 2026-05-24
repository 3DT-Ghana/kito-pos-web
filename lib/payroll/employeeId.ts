import { prisma } from '@/lib/db/prisma'

export async function generateStaffId(tenantId: string): Promise<string> {
  const [tenant, count] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { employeeIdPrefix: true } }),
    prisma.employee.count({ where: { tenantId } }),
  ])

  const prefix = tenant?.employeeIdPrefix?.trim().toUpperCase() || 'EMP'
  return `${prefix}-EMP-${String(count + 1).padStart(4, '0')}`
}
