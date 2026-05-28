import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { Role } from '@/lib/permissions/rbac'
import {
  authorizePlatformAdminCredentials,
  findPlatformAdminForSession,
} from '@/lib/admin/platformAdmins'
import { getCachedPlatformSettings } from '@/lib/admin/platformSettings'

type LoginPortal = 'business' | 'agent'

function getRequestedPortal(portal?: string): LoginPortal | null {
  return portal === 'business' || portal === 'agent' ? portal : null
}

async function authorizeBusinessUser(normalizedEmail: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { tenant: true },
  })

  if (!user) {
    return null
  }

  const valid = await compare(password, user.password)
  if (!valid) {
    return null
  }

  if (!user.isActive) {
    throw new Error('Your account has been disabled. Please contact your administrator.')
  }

  if (user.tenant.status === 'SUSPENDED') {
    throw new Error('Your account has been suspended. Please contact support.')
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as unknown as Role,
    tenantId: user.tenantId,
    branchId: user.branchId,
  }
}

async function authorizeAgentUser(normalizedEmail: string, password: string) {
  const agent = await prisma.agent.findUnique({
    where: { email: normalizedEmail },
  })

  if (!agent) {
    return null
  }

  const valid = await compare(password, agent.passwordHash)
  if (!valid) {
    return null
  }

  if (agent.status === 'REJECTED') {
    throw new Error('Your agent application has been rejected. Please contact support.')
  }

  if (agent.status === 'SUSPENDED') {
    throw new Error('Your agent account has been suspended. Please contact support.')
  }

  return {
    id: agent.id,
    email: agent.email,
    name: agent.fullName,
    role: 'STAFF' as unknown as Role,
    branchId: null,
    platformRole: 'AGENT' as const,
    agentId: agent.id,
    agentStatus: agent.status,
  }
}

export const authOptions: NextAuthOptions = {
  // NEXTAUTH_URL must be set to the live domain in production env vars.
  // Fallback: if not set, Next.js auto-detects from request headers (works on Vercel/DO).
  ...(process.env.NEXTAUTH_URL ? { url: process.env.NEXTAUTH_URL } : {}),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'your@email.com' },
        password: { label: 'Password', type: 'password' },
        portal: { label: 'Portal', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        try {
          const normalizedEmail = credentials.email.trim().toLowerCase()
          const requestedPortal = getRequestedPortal(credentials.portal)

          if (requestedPortal === 'business') {
            const businessUser = await authorizeBusinessUser(normalizedEmail, credentials.password)
            if (businessUser) {
              return businessUser
            }
            throw new Error('Invalid email or password')
          } else if (requestedPortal === 'agent') {
            const agentUser = await authorizeAgentUser(normalizedEmail, credentials.password)
            if (agentUser) {
              return agentUser
            }
            throw new Error('Invalid email or password')
          } else {
            const platformAdminAttempt = await authorizePlatformAdminCredentials(
              normalizedEmail,
              credentials.password
            )

            if (platformAdminAttempt.status === 'success') {
              return platformAdminAttempt.user
            }

            const [businessUser, agentUser] = await Promise.all([
              authorizeBusinessUser(normalizedEmail, credentials.password),
              authorizeAgentUser(normalizedEmail, credentials.password),
            ])

            if (businessUser) {
              return businessUser
            }

            if (agentUser) {
              return agentUser
            }

            if (platformAdminAttempt.status === 'invalid_password') {
              throw new Error('Invalid email or password')
            }
          }

          throw new Error('Invalid email or password')
        } catch (error) {
          console.error('Authentication error:', error)
          if (error instanceof Error) throw error
          throw new Error('Authentication failed. Please try again.')
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    // Keep the cookie alive for 24 h — the actual hard limit is enforced inside
    // the jwt callback by comparing loginAt against the DB-configured sessionMaxHours.
    maxAge: 24 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Stamp the exact login time so the 4-hour deadline is absolute,
        // not sliding — no amount of activity extends it past loginAt + 4h.
        token.loginAt = Math.floor(Date.now() / 1000)
        token.id = user.id
        token.email = user.email
        token.name = user.name
        // Tenant user fields
        if (user.role) token.role = user.role
        if (user.tenantId) token.tenantId = user.tenantId
        token.branchId = user.branchId ?? null
        // Agent/platform fields
        if (user.platformRole) token.platformRole = user.platformRole
        if (user.platformAdminId) token.platformAdminId = user.platformAdminId
        if (user.agentId) token.agentId = user.agentId
        if (user.agentStatus) token.agentStatus = user.agentStatus
      }

      if (token.platformRole === 'SUPER_ADMIN') {
        try {
          const platformAdmin = await findPlatformAdminForSession({
            platformAdminId: token.platformAdminId as string | null | undefined,
            email: token.email as string | null | undefined,
          })

          if (!platformAdmin) {
            token.expired = true
          } else {
            token.id = platformAdmin.id
            token.email = platformAdmin.email
            token.name = platformAdmin.name
            token.role = Role.OWNER
            token.tenantId = null
            token.branchId = null
            token.platformAdminId = platformAdmin.id
          }
        } catch (error) {
          console.error('Failed to refresh platform admin session:', error)

          if (token.platformAdminId && token.email && token.name) {
            token.id = token.platformAdminId as string
            token.role = Role.OWNER
            token.tenantId = null
            token.branchId = null
          } else {
            token.expired = true
          }
        }
      }

      if (token.platformRole === 'AGENT' && token.agentId) {
        const agent = await prisma.agent.findUnique({
          where: { id: token.agentId as string },
          select: {
            email: true,
            fullName: true,
            status: true,
          },
        })

        if (agent) {
          token.email = agent.email
          token.name = agent.fullName
          token.agentStatus = agent.status
        } else {
          token.agentStatus = 'REVOKED'
        }
      }

      // Enforce the admin-configured absolute session limit.
      if (token.loginAt) {
        const settings = await getCachedPlatformSettings()
        const sessionMaxHours = settings.sessionMaxHours

        const elapsedSecs = Math.floor(Date.now() / 1000) - (token.loginAt as number)
        if (elapsedSecs > sessionMaxHours * 60 * 60) {
          token.expired = true
        }
      }

      return token
    },

    async session({ session, token }) {
      // Session expired server-side — return a session with no user so NextAuth
      // middleware treats it as unauthenticated.
      if (token.expired) {
        return { ...session, user: undefined as unknown as typeof session.user, expires: new Date(0).toISOString() }
      }

      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        // Tenant user fields
        if (token.role) session.user.role = token.role as unknown as Role
        session.user.tenantId = (token.tenantId as string | null | undefined) ?? null
        session.user.branchId = (token.branchId as string | null | undefined) ?? null
        // Agent/platform fields
        if (token.platformRole) session.user.platformRole = token.platformRole as 'AGENT' | 'SUPER_ADMIN'
        session.user.platformAdminId = (token.platformAdminId as string | null | undefined) ?? null
        if (token.agentId) session.user.agentId = token.agentId as string
        if (token.agentStatus) session.user.agentStatus = token.agentStatus as string
      }
      return session
    },
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
