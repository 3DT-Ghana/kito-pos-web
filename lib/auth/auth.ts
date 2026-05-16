import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { Role } from '@/lib/permissions/rbac'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'your@email.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        try {
          const normalizedEmail = credentials.email.trim().toLowerCase()

          // ── 1. Try tenant user ───────────────────────────────────────────
          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: { tenant: true },
          })

          if (user) {
            const valid = await compare(credentials.password, user.password)
            if (!valid) throw new Error('Invalid email or password')

            const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean)

            if (superAdminEmails.includes(normalizedEmail)) {
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role as unknown as Role,
                branchId: null,
                platformRole: 'SUPER_ADMIN' as const,
              }
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

          // ── 2. Try platform agent ────────────────────────────────────────
          const agent = await prisma.agent.findUnique({
            where: { email: normalizedEmail },
          })

          if (agent) {
            const valid = await compare(credentials.password, agent.passwordHash)
            if (!valid) throw new Error('Invalid email or password')

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
              // Agents authenticate into the platform flow, not a tenant workspace.
              role: 'STAFF' as unknown as Role,
              branchId: null,
              platformRole: 'AGENT' as const,
              agentId: agent.id,
              agentStatus: agent.status,
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
    maxAge: 30 * 24 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        // Tenant user fields
        if (user.role) token.role = user.role
        if (user.tenantId) token.tenantId = user.tenantId
        token.branchId = user.branchId ?? null
        // Agent/platform fields
        if (user.platformRole) token.platformRole = user.platformRole
        if (user.agentId) token.agentId = user.agentId
        if (user.agentStatus) token.agentStatus = user.agentStatus
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

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        // Tenant user fields
        if (token.role) session.user.role = token.role as unknown as Role
        if (token.tenantId) session.user.tenantId = token.tenantId as string
        session.user.branchId = (token.branchId as string | null | undefined) ?? null
        // Agent/platform fields
        if (token.platformRole) session.user.platformRole = token.platformRole as 'AGENT' | 'SUPER_ADMIN'
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
