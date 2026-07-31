# Kito POS

Multi-tenant point-of-sale and business management application: sales, inventory,
purchasing, quotations, returns, payroll, accounting and reporting, with a
platform layer for super admins and field agents.

Built with Next.js 16 (App Router), React 19, Prisma, PostgreSQL, NextAuth and
Tailwind CSS 4.

## Production topology

| Layer | Service |
|---|---|
| Hosting | Vercel (Next.js, serverless functions) |
| Database | Neon Postgres — pooled endpoint at runtime, direct endpoint for migrations |
| Object storage | Cloudflare R2 — private bucket for KYC documents |
| DNS / TLS / WAF | Cloudflare in front of Vercel |

Full setup — provisioning, environment variables, DNS and SSL settings, caching
rules, security posture and known open items — is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Local development

```bash
cp .env.example .env.local     # then fill in real values
npm install
npx prisma migrate deploy
npm run seed                   # optional demo data
npm run dev
```

The app runs at <http://localhost:3000>.

`npm run dev` needs, at minimum, `DATABASE_URL`, `DIRECT_URL` and
`NEXTAUTH_SECRET`. Uploads additionally need the four `R2_*` variables; email
needs the `SMTP_*` ones. `npm run check:env` reports exactly what is missing.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run vercel-build` | Deploy build: env check → generate → migrate → build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check:env` | Validate environment configuration |
| `npm run migrate:deploy` | Apply pending Prisma migrations |
| `npm run seed` | Seed the database |

Before pushing, run what CI runs:

```bash
npm run typecheck && npm run lint && npm run build
```

## Layout

```
app/          App Router routes — pages under /<feature>, APIs under /api/<feature>
components/   Shared UI
hooks/        Client data-fetching hooks
lib/          Server logic, grouped by domain (sales, payroll, accounting, …)
  db/         Prisma client singleton
  env.ts      Validated environment configuration
  storage/    Cloudflare R2 client and upload helpers
prisma/       Schema, migrations and seeds
proxy.ts      Auth and routing gate (Next 16's middleware entry point)
scripts/      Build and maintenance scripts
```

## Health check

```bash
curl -s https://<your-domain>/api/health | jq
```

Returns 200 with `status: "ok"` when configuration is valid and Neon responds;
503 otherwise. It is intentionally public and reveals nothing beyond up/down.

## Roadmap

Planned features are tracked in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).
