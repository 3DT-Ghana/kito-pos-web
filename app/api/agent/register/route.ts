import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { normalizeEmail } from '@/lib/tenant/onboarding'

/**
 * POST /api/agent/register
 * Public endpoint — registers a new sales agent (status: PENDING).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { fullName, phone, email, password, residentialAddress, territory } = body
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

    const existing = await prisma.agent.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    // Generate sequential agentCode: AGT-0001, AGT-0002, …
    const count = await prisma.agent.count()
    const agentCode = `AGT-${String(count + 1).padStart(4, '0')}`

    const passwordHash = await hash(password, 12)

    const agent = await prisma.agent.create({
      data: {
        agentCode,
        fullName: trimmedFullName,
        phone: trimmedPhone,
        email: normalizedEmail,
        passwordHash,
        residentialAddress: residentialAddress?.trim() || null,
        territory: territory?.trim() || null,
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
    console.error('Agent register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
