import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { BusinessApplicationStatus } from '@prisma/client'

/**
 * GET /api/admin/applications
 * List all business applications.
 * Optional query params: ?status=PENDING|APPROVED|REJECTED|SUSPENDED, ?agentId=...
 */
export async function GET(req: Request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as BusinessApplicationStatus | null
  const agentId = searchParams.get('agentId')

  const applications = await prisma.businessApplication.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(agentId ? { agentId } : {}),
    },
    include: {
      agent: {
        select: { id: true, agentCode: true, fullName: true, email: true, phone: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(applications)
}
