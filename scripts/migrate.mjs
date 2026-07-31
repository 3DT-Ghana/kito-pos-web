/**
 * Apply pending Prisma migrations during a Vercel build.
 *
 * Guard rail: preview deployments inherit production environment variables
 * unless they are overridden per-environment, so an unguarded `migrate deploy`
 * in a preview build would run DDL against the live database. Preview builds
 * therefore skip migrations unless ALLOW_PREVIEW_MIGRATIONS=true — set that only
 * when previews point at their own Neon branch.
 *
 *   node scripts/migrate.mjs
 */
import { spawnSync } from 'node:child_process'

const vercelEnv = process.env.VERCEL_ENV
const allowPreview = process.env.ALLOW_PREVIEW_MIGRATIONS === 'true'

if (vercelEnv === 'preview' && !allowPreview) {
  console.log(
    '↷ Preview build — skipping `prisma migrate deploy`.\n' +
      '  Point previews at a Neon branch and set ALLOW_PREVIEW_MIGRATIONS=true to enable.'
  )
  process.exit(0)
}

console.log('→ Applying database migrations (prisma migrate deploy)…')

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
