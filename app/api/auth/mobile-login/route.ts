import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { sign } from 'jsonwebtoken'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/auth/mobile-login
 * Mobile-app credential login — returns a signed JWT instead of a cookie.
 * The mobile app stores this token in SecureStore and sends it as
 *   Authorization: Bearer <token>
 * on every request. The existing requireBranchAccess() middleware already
 * accepts Bearer tokens via the Authorization header (falls back to cookie).
 *
 * Body: { email: string; password: string }
 * Returns: { token: string; user: { id, name, email, role, tenantId, branchId } }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email    = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { status: true } } },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await compare(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been disabled. Please contact your administrator.' },
        { status: 403 }
      )
    }

    if (user.tenant.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 })
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const payload = {
      id:       user.id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      tenantId: user.tenantId,
      branchId: user.branchId ?? null,
    }

    // 24-hour expiry — matches the web session maxAge
    const token = sign(payload, secret, { expiresIn: '24h' })

    return NextResponse.json({ token, user: payload })
  } catch (err) {
    console.error('Mobile login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
