/**
 * Fail a deploy early when required configuration is missing.
 *
 * Runs as the first step of `npm run vercel-build`, so a misconfigured project
 * surfaces as a clear build error instead of a 500 on the first request.
 *
 *   npm run check:env
 */
import { checkEnv } from '../lib/env'

const { ok, missing } = checkEnv()

if (ok) {
  console.log('✓ Environment configuration is complete.')
  process.exit(0)
}

console.error('\n✗ Environment configuration is incomplete:\n')
for (const problem of missing) {
  console.error(`   • ${problem}`)
}
console.error(
  '\nSet these in the Vercel project (Settings → Environment Variables) or in .env.local.'
)
console.error('See .env.example and DEPLOYMENT.md for what each variable is.\n')
process.exit(1)
