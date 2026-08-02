import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'

/**
 * GET /api/auth/mobile-session
 * Validates the Bearer token stored on the mobile device.
 * Returns the current tenant user if valid and still active.
 */
export async function GET() {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    return NextResponse.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      tenantId,
      branchId: user!.branchId ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}
