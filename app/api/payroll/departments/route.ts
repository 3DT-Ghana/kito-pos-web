import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  const departments = await prisma.payrollDepartment.findMany({
    where: { tenantId: context!.tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return NextResponse.json({ departments })
}

export async function POST(req: Request) {
  const { error, context } = await requireBranchAccess()
  if (error) return error

  try {
    const { name } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 })
    }

    const department = await prisma.payrollDepartment.create({
      data: { tenantId: context!.tenantId, name: name.trim() },
      select: { id: true, name: true },
    })

    return NextResponse.json({ department }, { status: 201 })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Department already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 })
  }
}
