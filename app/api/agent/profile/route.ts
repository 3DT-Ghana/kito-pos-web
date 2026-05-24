import { NextResponse } from 'next/server'
import { requireAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

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

  const [agent, kycSettings] = await Promise.all([
    prisma.agent.findUnique({
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
        emergencyContactName: true,
        emergencyContactPhone: true,
        status: true,
        approvedAt: true,
        createdAt: true,
        _count: { select: { onboardedBusinesses: true } },
      },
    }),
    getGlobalKYCSettings(),
  ])

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...agent,
    kycRequirements: {
      requireAgentGhanaCardNumber: kycSettings.requireAgentGhanaCardNumber,
      requireAgentGhanaCardUpload: kycSettings.requireAgentGhanaCardUpload,
    },
  })
}

export async function PATCH(req: Request) {
  const { context, error } = await requireAgent()
  if (error) return error

  try {
    const body = await req.json()
    const {
      phone,
      residentialAddress,
      territory,
      emergencyContactName,
      emergencyContactPhone,
      ghanaCardNumber,
    } = body
    const kycSettings = await getGlobalKYCSettings()
    const trimmedGhanaCardNumber =
      typeof ghanaCardNumber === 'string' ? ghanaCardNumber.trim() : undefined

    if (ghanaCardNumber !== undefined && kycSettings.requireAgentGhanaCardNumber && !trimmedGhanaCardNumber) {
      return NextResponse.json(
        { error: 'Ghana Card Number is required by the current KYC settings' },
        { status: 400 }
      )
    }

    const updated = await prisma.agent.update({
      where: { id: context!.agent.id },
      data: {
        ...(phone ? { phone } : {}),
        ...(residentialAddress !== undefined ? { residentialAddress } : {}),
        ...(territory !== undefined ? { territory } : {}),
        ...(ghanaCardNumber !== undefined ? { ghanaCardNumber: trimmedGhanaCardNumber || null } : {}),
        ...(emergencyContactName !== undefined ? { emergencyContactName: emergencyContactName || null } : {}),
        ...(emergencyContactPhone !== undefined ? { emergencyContactPhone: emergencyContactPhone || null } : {}),
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
        emergencyContactName: true,
        emergencyContactPhone: true,
        status: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Agent profile update error:', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
