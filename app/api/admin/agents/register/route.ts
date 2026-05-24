import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requireSuperAdmin } from '@/lib/admin/server'
import { normalizeEmail } from '@/lib/tenant/onboarding'
import { createAgentWithGeneratedCode } from '@/lib/agent/server'
import { isUniqueConstraintError } from '@/lib/db/prismaErrors'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

/**
 * POST /api/admin/agents/register
 * Super admin directly creates a new agent account (status: APPROVED by default).
 * Body: { fullName, phone, email, password, residentialAddress?, territory?,
 *         ghanaCardNumber?, emergencyContactName?, emergencyContactPhone?,
 *         status? }
 */
export async function POST(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const body = await req.json()
    const {
      fullName,
      phone,
      email,
      password,
      residentialAddress,
      territory,
      ghanaCardNumber,
      emergencyContactName,
      emergencyContactPhone,
      status = 'APPROVED',
    } = body

    const normalizedEmail = normalizeEmail(String(email ?? ''))
    const trimmedFullName = String(fullName ?? '').trim()
    const trimmedPhone = String(phone ?? '').trim()

    if (!trimmedFullName || !trimmedPhone || !normalizedEmail || !password) {
      return NextResponse.json(
        { error: 'fullName, phone, email and password are required' },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const validStatuses = ['PENDING', 'APPROVED']
    const resolvedStatus = validStatuses.includes(status) ? status : 'APPROVED'
    const kycSettings = await getGlobalKYCSettings()

    if (kycSettings.requireAgentGhanaCardNumber && !ghanaCardNumber?.trim()) {
      return NextResponse.json(
        { error: 'Ghana Card Number is required by the current KYC settings' },
        { status: 400 }
      )
    }

    if (kycSettings.requireAgentGhanaCardUpload && resolvedStatus === 'APPROVED') {
      return NextResponse.json(
        {
          error:
            'Current KYC settings require a Ghana Card image before approval. Create the agent as PENDING, then upload the card from the agent profile before approving.',
        },
        { status: 400 }
      )
    }

    const existing = await prisma.agent.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await hash(password, 12)

    const agent = await createAgentWithGeneratedCode({
      data: {
        fullName: trimmedFullName,
        phone: trimmedPhone,
        email: normalizedEmail,
        passwordHash,
        ghanaCardNumber: ghanaCardNumber?.trim() || null,
        residentialAddress: residentialAddress?.trim() || null,
        territory: territory?.trim() || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone?.trim() || null,
        status: resolvedStatus,
        registeredByAdminEmail: context!.email,
        ...(resolvedStatus === 'APPROVED'
          ? { approvedAt: new Date(), approvedById: context!.email }
          : {}),
      },
      select: {
        id: true,
        agentCode: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'agent.registered_by_admin',
        entity: 'Agent',
        entityId: agent.id,
        details: { agentCode: agent.agentCode, status: resolvedStatus },
      },
    })

    return NextResponse.json(agent, { status: 201 })
  } catch (err) {
    if (isUniqueConstraintError(err, 'email')) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    console.error('Admin agent register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
