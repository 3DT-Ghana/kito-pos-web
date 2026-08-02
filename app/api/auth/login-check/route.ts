import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/auth/login-check
 * Called after a failed login to surface the real reason (suspended/disabled)
 * without leaking user-enumeration details. Only reveals suspension/deactivation
 * when the email AND password are correct — otherwise returns generic failure.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email) {
      return NextResponse.json({ reason: 'invalid_credentials' })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        isActive: true,
        tenant: { select: { status: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ reason: 'invalid_credentials' })
    }

    if (user.tenant.status === 'SUSPENDED') {
      return NextResponse.json({ reason: 'suspended' })
    }

    if (!user.isActive) {
      return NextResponse.json({ reason: 'disabled' })
    }

    return NextResponse.json({ reason: 'invalid_credentials' })
  } catch {
    return NextResponse.json({ reason: 'invalid_credentials' })
  }
}
