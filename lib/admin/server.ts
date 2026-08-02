import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth/auth'

interface AdminContext {
  platformAdminId: string
  email: string
  name: string
}

interface RequireSuperAdminResult {
  context: AdminContext | null
  error: NextResponse | null
}

/**
 * Require a platform super-admin session.
 * Platform admins authenticate independently from tenant users.
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

  if (session.user.platformRole !== 'SUPER_ADMIN') {
    return {
      context: null,
      error: NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 }),
    }
  }

  if (!session.user.platformAdminId) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'Forbidden — platform admin session is incomplete' },
        { status: 403 }
      ),
    }
  }

  return {
    context: {
      platformAdminId: session.user.platformAdminId,
      email,
      name: session.user.name ?? 'Platform Admin',
    },
    error: null,
  }
}
