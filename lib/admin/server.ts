import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth/auth'

interface AdminContext {
  email: string
}

interface RequireSuperAdminResult {
  context: AdminContext | null
  error: NextResponse | null
}

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/**
 * Require a platform super-admin session.
 * Super admins are defined by the SUPER_ADMIN_EMAILS env var.
 */
export async function requireSuperAdmin(): Promise<RequireSuperAdminResult> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return {
      context: null,
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  const email = session.user.email.toLowerCase()

  // Reject agents trying to access admin routes
  if (session.user.platformRole === 'AGENT') {
    return {
      context: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (!SUPER_ADMIN_EMAILS.includes(email)) {
    return {
      context: null,
      error: NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 }),
    }
  }

  return { context: { email }, error: null }
}
