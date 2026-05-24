import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { AgentStatus } from '@prisma/client'
import { getGlobalKYCSettings, getMissingAgentKYCRequirements } from '@/lib/kyc/settings'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/agents/[id]
 * Get agent detail with their business applications.
 *
 * PATCH /api/admin/agents/[id]
 * Update agent status (APPROVED | REJECTED | SUSPENDED).
 * Body: { status, rejectionReason? }
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
    const { status, rejectionReason } = body
    const trimmedRejectionReason =
      typeof rejectionReason === 'string' ? rejectionReason.trim() : ''

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

    if (status === 'REJECTED' && !trimmedRejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required when rejecting an agent' },
        { status: 400 }
      )
    }

    if (status === 'APPROVED') {
      const kycSettings = await getGlobalKYCSettings()
      const missingKYC = getMissingAgentKYCRequirements(kycSettings, agent)

      if (missingKYC.length > 0) {
        return NextResponse.json(
          {
            error: `Agent cannot be approved until the following KYC requirements are met: ${missingKYC.join(', ')}.`,
          },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? trimmedRejectionReason : null,
        ...(status === 'APPROVED'
          ? {
              approvedAt: agent.approvedAt ?? new Date(),
              approvedById: agent.approvedById ?? context!.email,
            }
          : {}),
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: `agent.${status.toLowerCase()}`,
        entity: 'Agent',
        entityId: id,
        details: {
          agentCode: agent.agentCode,
          previousStatus: agent.status,
          newStatus: status,
          rejectionReason: status === 'REJECTED' ? trimmedRejectionReason : null,
        },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Agent status update error:', err)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}
