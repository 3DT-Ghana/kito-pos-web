import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { normalizeEmail } from '@/lib/tenant/onboarding'
import { createAgentWithGeneratedCode } from '@/lib/agent/server'
import { isUniqueConstraintError } from '@/lib/db/prismaErrors'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

/**
 * POST /api/agent/register
 * Public endpoint — registers a new sales agent (status: PENDING).
 * Body: { fullName, phone, email, password, residentialAddress?, territory?,
 *         ghanaCardNumber?, emergencyContactName?, emergencyContactPhone? }
 */
export async function POST(req: Request) {
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

    // Ghana Card number required by default; upsert so we always have a settings row
    const kycSettings = await getGlobalKYCSettings()
    if (kycSettings.requireAgentGhanaCardNumber && !ghanaCardNumber?.trim()) {
      return NextResponse.json(
        { error: 'Ghana Card Number is required for agent registration' },
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
      },
      select: {
        id: true,
        agentCode: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        ...agent,
        message: 'Registration successful. Your account is pending approval.',
      },
      { status: 201 }
    )
  } catch (err) {
    if (isUniqueConstraintError(err, 'email')) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    console.error('Agent register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
