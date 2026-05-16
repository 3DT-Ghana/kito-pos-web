import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { AgentStatus } from '@prisma/client'

/**
 * GET /api/admin/agents
 * List all agents. Optional query param: ?status=PENDING|APPROVED|REJECTED|SUSPENDED
 */
export async function GET(req: Request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as AgentStatus | null

  const agents = await prisma.agent.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      agentCode: true,
      fullName: true,
      phone: true,
      email: true,
      ghanaCardNumber: true,
      ghanaCardImageUrl: true,
      territory: true,
      status: true,
      approvedAt: true,
      approvedById: true,
      createdAt: true,
      _count: { select: { onboardedBusinesses: true } },
    },
  })

  return NextResponse.json(agents)
}
