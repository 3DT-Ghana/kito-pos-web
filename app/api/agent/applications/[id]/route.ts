import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/agent/applications/[id]
 * Get a single business application belonging to the authenticated agent.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  const { id } = await params

  const application = await prisma.businessApplication.findFirst({
    where: { id, agentId: context!.agent.id },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  return NextResponse.json(application)
}
