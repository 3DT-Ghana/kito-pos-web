import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { AgentStatus } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/agents/[id]
 * Get agent detail with their business applications.
 *
 * PATCH /api/admin/agents/[id]
 * Update agent status (APPROVED | REJECTED | SUSPENDED).
 */

export async function GET(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      onboardedBusinesses: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  return NextResponse.json(agent)
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const { status } = body

    const validStatuses: AgentStatus[] = ['APPROVED', 'REJECTED', 'SUSPENDED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of: APPROVED, REJECTED, SUSPENDED' },
        { status: 400 }
      )
    }

    const agent = await prisma.agent.findUnique({ where: { id } })
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        status,
        ...(status === 'APPROVED'
          ? { approvedAt: new Date(), approvedById: context!.email }
          : {}),
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: `agent.${status.toLowerCase()}`,
        entity: 'Agent',
        entityId: id,
        details: { agentCode: agent.agentCode, previousStatus: agent.status, newStatus: status },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Agent status update error:', err)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}
