import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { Agent, Prisma } from '@prisma/client'
import { isUniqueConstraintError } from '@/lib/db/prismaErrors'

/**
 * Generate the next unique agent code in AGT-XXXX format.
 * Uses the highest existing code rather than COUNT to avoid race conditions
 * when two registrations happen concurrently.
 */
export async function generateAgentCode(): Promise<string> {
  const last = await prisma.agent.findFirst({
    orderBy: { agentCode: 'desc' },
    select: { agentCode: true },
  })
  const lastNum = last ? parseInt(last.agentCode.replace('AGT-', ''), 10) : 0
  return `AGT-${String(lastNum + 1).padStart(4, '0')}`
}

export async function createAgentWithGeneratedCode<T extends Prisma.AgentSelect>(params: {
  data: Omit<Prisma.AgentCreateInput, 'agentCode'>
  select: T
  maxRetries?: number
}) {
  const { data, select, maxRetries = 5 } = params

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const agentCode = await generateAgentCode()

    try {
      return await prisma.agent.create({
        data: {
          agentCode,
          ...data,
        },
        select,
      })
    } catch (error) {
      if (isUniqueConstraintError(error, 'agentCode')) {
        continue
      }

      throw error
    }
  }

  throw new Error('Failed to allocate a unique agent code')
}

interface AgentContext {
  agent: Agent
  session: { user: { id: string; email: string; agentStatus?: string } }
}

interface RequireAgentResult {
  context: AgentContext | null
  error: NextResponse | null
}

/**
 * Require an authenticated platform agent.
 * Works for any agent status (PENDING, APPROVED, SUSPENDED).
 * Use requireApprovedAgent() to restrict to APPROVED agents.
 */
export async function requireAgent(): Promise<RequireAgentResult> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.platformRole || session.user.platformRole !== 'AGENT') {
    return {
      context: null,
      error: NextResponse.json({ error: 'Agent authentication required' }, { status: 401 }),
    }
  }

  const agent = await prisma.agent.findUnique({
    where: { id: session.user.agentId! },
  })

  if (!agent) {
    return {
      context: null,
      error: NextResponse.json({ error: 'Agent not found' }, { status: 401 }),
    }
  }

  if (agent.status === 'REJECTED') {
    return {
      context: null,
      error: NextResponse.json({ error: 'Agent application has been rejected' }, { status: 403 }),
    }
  }

  if (agent.status === 'SUSPENDED') {
    return {
      context: null,
      error: NextResponse.json({ error: 'Agent account is suspended' }, { status: 403 }),
    }
  }

  return { context: { agent, session: session as AgentContext['session'] }, error: null }
}

/**
 * Require an APPROVED agent. PENDING agents are rejected with 403.
 */
export async function requireApprovedAgent(): Promise<RequireAgentResult> {
  const result = await requireAgent()
  if (result.error) return result

  if (result.context!.agent.status !== 'APPROVED') {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'Your account is pending approval. You cannot perform this action yet.' },
        { status: 403 }
      ),
    }
  }

  return result
}
