import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const { id } = await params

  const dept = await prisma.payrollDepartment.findFirst({
    where: { id, tenantId: context!.tenantId },
  })
  if (!dept) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.payrollDepartment.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
