import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { checkEnv } from '@/lib/env'

/**
 * GET /api/health
 *
 * Liveness/readiness probe for uptime monitoring and for confirming a deploy
 * actually reached the database. Deliberately unauthenticated (it is listed as a
 * public API in proxy.ts) but it reveals nothing beyond up/down and a round-trip
 * latency — never connection strings, versions or the specific missing variable.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()

  const env = checkEnv()
  let database: 'up' | 'down' = 'down'
  let databaseLatencyMs: number | null = null

  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    databaseLatencyMs = Date.now() - dbStart
    database = 'up'
  } catch (err) {
    console.error('[health] database check failed:', err)
  }

  const healthy = database === 'up' && env.ok

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      databaseLatencyMs,
      config: env.ok ? 'ok' : 'incomplete',
      // Useful for confirming which build is live. Vercel injects
      // VERCEL_GIT_COMMIT_SHA; the Hetzner image bakes in APP_COMMIT_SHA at
      // build time (see docker/Dockerfile).
      commit:
        (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_COMMIT_SHA)?.slice(0, 7) || null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      uptimeCheckMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
