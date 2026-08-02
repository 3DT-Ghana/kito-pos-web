import { z } from 'zod'

/**
 * Runtime environment validation.
 *
 * Server code should read configuration from here rather than touching
 * `process.env` directly, so a missing or malformed value fails loudly at
 * startup instead of surfacing as a confusing runtime error deep in a request.
 *
 * Validation is deliberately lazy (see `env()` below): `next build` runs on a
 * machine that does not necessarily have production secrets, and prerendering a
 * page must not require SMTP or R2 credentials. Values are checked the first
 * time they are actually read.
 */

const serverSchema = z.object({
  // ── Database (Neon) ────────────────────────────────────────────────────────
  // DATABASE_URL points at the Neon *pooled* endpoint (host contains `-pooler`).
  // DIRECT_URL points at the unpooled endpoint and is used only by Prisma
  // Migrate / Introspect, which cannot run DDL through PgBouncer. It is not
  // optional: prisma/schema.prisma reads it via env(), and Prisma fails schema
  // validation outright when it is absent — including during `prisma generate`.
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // ── Auth ───────────────────────────────────────────────────────────────────
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url().optional(),
  SUPER_ADMIN_EMAILS: z.string().optional(),
  APPROVAL_GRANT_SECRET: z.string().optional(),

  // ── Cloudflare R2 (object storage) ─────────────────────────────────────────
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // Optional: an S3 endpoint override, e.g. when using a jurisdiction-specific
  // bucket (`<account>.eu.r2.cloudflarestorage.com`).
  R2_ENDPOINT: z.string().url().optional(),

  // ── Email (SMTP) ───────────────────────────────────────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

/** Groups of variables that are validated together, on first use. */
const groups = {
  database: ['DATABASE_URL', 'DIRECT_URL'],
  auth: ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'SUPER_ADMIN_EMAILS', 'APPROVAL_GRANT_SECRET'],
  storage: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'],
  email: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
} as const satisfies Record<string, readonly (keyof ServerEnv)[]>

export type EnvGroup = keyof typeof groups

const validated = new Set<EnvGroup>()

/**
 * Validate one group of environment variables and return them typed.
 * Throws a single readable error listing every problem in the group.
 */
export function env<G extends EnvGroup>(group: G): Pick<ServerEnv, (typeof groups)[G][number]> {
  const keys = groups[group] as readonly (keyof ServerEnv)[]

  if (!validated.has(group)) {
    const shape = Object.fromEntries(keys.map((k) => [k, serverSchema.shape[k]]))
    const result = z.object(shape).safeParse(process.env)

    if (!result.success) {
      const problems = result.error.issues
        .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n')
      throw new Error(
        `Invalid environment configuration for "${group}":\n${problems}\n\n` +
          `See .env.example and DEPLOYMENT.md for the full list of required variables.`
      )
    }

    validated.add(group)
  }

  return Object.fromEntries(
    keys.map((k) => [k, process.env[k as string]])
  ) as Pick<ServerEnv, (typeof groups)[G][number]>
}

/**
 * Check every group without throwing — used by the health endpoint and by the
 * `check:env` script so misconfiguration is visible before traffic hits.
 */
export function checkEnv(): { ok: boolean; missing: string[] } {
  const missing: string[] = []

  for (const [name, keys] of Object.entries(groups)) {
    const shape = Object.fromEntries(
      (keys as readonly (keyof ServerEnv)[]).map((k) => [k, serverSchema.shape[k]])
    )
    const result = z.object(shape).safeParse(process.env)
    if (!result.success) {
      for (const issue of result.error.issues) {
        missing.push(`${name}.${issue.path.join('.')}: ${issue.message}`)
      }
    }
  }

  return { ok: missing.length === 0, missing }
}

/** Comma-separated SUPER_ADMIN_EMAILS, normalised to lowercase. */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'
