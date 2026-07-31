import { PrismaClient } from '@prisma/client'

/**
 * Prisma Client Singleton
 *
 * On Vercel every serverless invocation may reuse a warm Node process, so the
 * client is cached on `globalThis` in all environments — not just development.
 * Creating a new PrismaClient per request would open a new connection pool per
 * request and exhaust Neon's pooler under load.
 *
 * Connection notes (see DEPLOYMENT.md):
 *   DATABASE_URL — Neon *pooled* endpoint (host contains `-pooler`). Used at
 *                  runtime by this client.
 *   DIRECT_URL   — Neon *unpooled* endpoint. Used only by `prisma migrate` /
 *                  `prisma db push`, which cannot run DDL through PgBouncer.
 *
 * There is deliberately no `process.on('beforeExit')` disconnect hook here:
 * `beforeExit` never fires when a serverless function is frozen or reclaimed, and
 * registering a listener on every module evaluation leaks listeners in dev.
 * Prisma closes its own connections when the process exits.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'minimal',
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Cache in every environment: dev to survive hot-reload, production to survive
// warm serverless invocations.
globalForPrisma.prisma = prisma

export default prisma
