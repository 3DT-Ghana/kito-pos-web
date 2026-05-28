import { NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'

/**
 * GET /api/auth/mobile-session
 * Validates the Bearer token stored on the mobile device.
 * Returns the user payload if valid, 401 if expired/invalid.
 */
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 })

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const payload = verify(token, secret) as Record<string, unknown>
    const { iat, exp, ...user } = payload
    void iat; void exp
    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}
