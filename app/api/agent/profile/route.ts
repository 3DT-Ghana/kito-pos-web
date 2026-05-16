import { NextResponse } from 'next/server'
import { requireAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/agent/profile
 * Returns the authenticated agent's profile.
 *
 * PATCH /api/agent/profile
 * Update agent profile fields (phone, residentialAddress, territory).
 */

export async function GET() {
  const { context, error } = await requireAgent()
  if (error) return error

  const agent = await prisma.agent.findUnique({
    where: { id: context!.agent.id },
    select: {
      id: true,
      agentCode: true,
      fullName: true,
      phone: true,
      email: true,
      ghanaCardNumber: true,
      ghanaCardImageUrl: true,
      residentialAddress: true,
      territory: true,
      status: true,
      approvedAt: true,
      createdAt: true,
      _count: { select: { onboardedBusinesses: true } },
    },
  })

  return NextResponse.json(agent)
}

export async function PATCH(req: Request) {
  const { context, error } = await requireAgent()
  if (error) return error

  try {
    const body = await req.json()
    const { phone, residentialAddress, territory } = body

    const updated = await prisma.agent.update({
      where: { id: context!.agent.id },
      data: {
        ...(phone ? { phone } : {}),
        ...(residentialAddress !== undefined ? { residentialAddress } : {}),
        ...(territory !== undefined ? { territory } : {}),
      },
      select: {
        id: true,
        agentCode: true,
        fullName: true,
        phone: true,
        email: true,
        ghanaCardNumber: true,
        ghanaCardImageUrl: true,
        residentialAddress: true,
        territory: true,
        status: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Agent profile update error:', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
