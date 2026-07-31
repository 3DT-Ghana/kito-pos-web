# Market Inventory — deployment on Vercel, Neon and Cloudflare

The production topology:

```
  Browser
     │  HTTPS
     ▼
  Cloudflare  ──  DNS, TLS, WAF, bot protection, caching of static assets
     │  HTTPS (Full strict)
     ▼
  Vercel      ──  Next.js app + serverless functions (region fra1)
     │                    │
     │ Postgres           │ S3 API
     ▼                    ▼
  Neon                 Cloudflare R2
  (pooled endpoint)    (private bucket, KYC documents)
```

---

## 1. Neon

### Create the database

1. <https://console.neon.tech> → **New Project**.
2. Pick the region closest to your Vercel function region. This repo ships
   `"regions": ["fra1"]` in [vercel.json](vercel.json) (Frankfurt), so choose
   Neon's **AWS eu-central-1**. If you move one, move the other — a
   cross-continent hop is added to *every* query.
3. Copy both connection strings from **Connection Details**:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** (same host without `-pooler`) → `DIRECT_URL`

`prisma/schema.prisma` already declares both:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Application queries go through PgBouncer (`DATABASE_URL`); `prisma migrate` uses
the direct endpoint (`DIRECT_URL`) because DDL cannot run through a transaction
pooler.

> Prisma 5.10+ no longer needs `?pgbouncer=true` against Neon. Keep
> `sslmode=require` (and `channel_binding=require` if Neon supplies it).

### Tuning

Each warm serverless instance keeps its own Prisma pool. If you see
`Timed out fetching a new connection from the connection pool`, add
`&connection_limit=5&pool_timeout=15` to `DATABASE_URL` and raise or lower from
there.

### Migrations

Migrations run automatically as part of the Vercel build:

```
npm run vercel-build
  → tsx scripts/check-env.ts     # fail fast on missing config
  → prisma generate
  → node scripts/migrate.mjs     # prisma migrate deploy
  → next build
```

`scripts/migrate.mjs` **skips migrations on preview deployments** unless
`ALLOW_PREVIEW_MIGRATIONS=true`. Preview deployments inherit production
environment variables by default, so without that guard a preview build would
run DDL against live data. To enable preview migrations properly, create a Neon
branch per preview, override `DATABASE_URL`/`DIRECT_URL` for the Preview
environment, and then set the flag.

To seed a fresh database once:

```bash
npm run seed
```

---

## 2. Cloudflare R2 (object storage)

KYC documents — agent Ghana Cards and business application documents — used to
live in Supabase Storage. They now live in a **private** R2 bucket.

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `market-inventory-documents`).
   Leave public access **disabled**; do not attach a custom domain.
2. **R2 → Manage API Tokens → Create API Token**, permission **Object Read &
   Write**, scoped to that bucket. Copy the Access Key ID and Secret Access Key
   (the secret is shown once).
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
   Only set `R2_ENDPOINT` for a jurisdiction-restricted bucket
   (`https://<account-id>.eu.r2.cloudflarestorage.com`).

### How files are served

Nothing links to R2 directly. The upload routes persist an app-relative path:

```
/api/files/agents/<agentId>/ghana-card.jpg
/api/files/businesses/<applicationId>/ghana_card-<ts>.pdf
```

[`app/api/files/[...key]/route.ts`](app/api/files/[...key]/route.ts) resolves it:
it checks the session, confirms the caller owns the object (or is a super admin),
then streams the object out of R2 with `Cache-Control: private, no-store`.

This is deliberate. Presigned S3 URLs expire after at most 7 days, so the old
"store a one-year signed URL on the row" approach could not be carried over —
and re-checking authorisation on every view is stronger than authorising once at
upload time. The bucket needs no public access at all.

Rows written before the migration still hold absolute Supabase URLs and keep
rendering from their original host; `keyFromFileUrl()` returns `null` for them.
If you are cutting over with existing data, copy the objects into R2 and rewrite
`Agent.ghanaCardImageUrl` / `BusinessDocument.fileUrl` to the `/api/files/…` form.

### Upload size

Capped at **4 MB** (`lib/storage/limits.ts`). Vercel rejects request bodies over
roughly 4.5 MB at the platform edge before the handler runs, so a higher cap
would surface as an opaque 413 instead of a validation message. For larger
files, presign a PUT and upload from the browser straight to R2 — `lib/storage/r2.ts`
already has the signing client.

---

## 3. Vercel

### Import

1. <https://vercel.com/new> → import `eyosolutionsgh/point-of-sale`.
2. Framework preset **Next.js**. Build settings come from
   [vercel.json](vercel.json) — leave the dashboard fields empty.
3. Add every variable from [.env.example](.env.example) under
   **Settings → Environment Variables** for Production (and Preview, pointing at
   a Neon branch).

`NEXTAUTH_URL` must be the **Cloudflare-fronted domain**, not the `*.vercel.app`
URL, or sign-in callbacks redirect to the wrong host.

### What vercel.json sets

| Setting | Value | Why |
|---|---|---|
| `regions` | `fra1` | Must match the Neon region |
| `buildCommand` | `npm run vercel-build` | env check → generate → migrate → build |
| `installCommand` | `npm ci` | Lockfile-exact installs |
| `functions` maxDuration | 60 s for all `/api` routes | Reports and spreadsheet imports outrun the default; `maxDuration` is a ceiling, not a reservation, so a single rule costs nothing extra and avoids overlapping globs |

### Verify a deploy

```bash
curl -s https://pos.example.com/api/health | jq
```

`status: "ok"` means the build is live, configuration validated, and Neon
answered a `SELECT 1`. It returns 503 with `database: "down"` or
`config: "incomplete"` otherwise, without leaking which variable is missing.

---

## 4. Cloudflare DNS + CDN in front of Vercel

1. Add the domain to Cloudflare and move the nameservers at your registrar.
2. In Vercel: **Project → Settings → Domains → Add** `pos.example.com`. Vercel
   shows the target record.
3. In Cloudflare DNS, create it as **CNAME → `cname.vercel-dns.com`**, proxy
   status **Proxied** (orange cloud).
4. **SSL/TLS → Overview → Full (strict)**. Anything less (Flexible especially)
   creates an HTTP hop to Vercel, which breaks `Secure` session cookies and
   causes redirect loops.
5. **SSL/TLS → Edge Certificates**: Always Use HTTPS **on**, Minimum TLS **1.2**,
   Automatic HTTPS Rewrites **on**. Leave HSTS to the origin — the app already
   emits `Strict-Transport-Security` from `next.config.ts`.

### Caching

A POS is almost entirely per-user and per-tenant. Do **not** enable "Cache
Everything" on the zone.

- Leave the default: Cloudflare caches static extensions only.
- `/_next/static/*` is content-hashed and immutable — safe to cache hard.
  Optional Cache Rule: match `/_next/static/*` → Cache eligible, Edge TTL 1 year.
- Add a Cache Rule that **bypasses cache** for `/api/*`. `next.config.ts` already
  sends `Cache-Control: private, no-store` on those routes, but an explicit rule
  removes any doubt.
- Never cache `/api/files/*`. Those responses are authorised per request.

### Security

- **WAF → Managed rules**: enable the Cloudflare Managed Ruleset.
- **Bot Fight Mode** on. If you later add a public API for tills or scanners,
  exempt its path first.
- **Rate limiting** (recommended): a rule on `/api/auth/*` — 10 requests per
  minute per IP — blunts credential stuffing. The app's own session logic does
  not rate-limit sign-in.
- Vercel **Deployment Protection**: leave Vercel Authentication on for Preview so
  previews of a POS are not publicly reachable.

### Verify the chain

```bash
curl -sI https://pos.example.com | grep -iE 'server|cf-cache-status|strict-transport'
```

`server: cloudflare` confirms the proxy is live; the HSTS header confirms the
origin app is the one answering.

---

## 5. Security posture

Set by the app itself:

- **`next.config.ts`** — CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS,
  and `Cache-Control: private, no-store` on `/api/*`. `poweredByHeader` is off.
- **`proxy.ts`** — authentication gate. Agents cannot reach tenant APIs, super
  admins cannot reach tenant APIs, tenant users cannot reach `/api/admin/*`.
  `/api/health` is public; `/api/files/*` is authenticated and authorised inside
  the route handler.
- **`lib/env.ts`** — every server variable is schema-validated on first use, and
  `npm run check:env` fails the build before a bad config can deploy.

Next 16 removed `next lint` and the `eslint` key in `next.config.ts`, so linting
is a standalone step (`npm run lint`) that CI runs alongside `typecheck` and
`build`.

### CSP note

The policy in `next.config.ts` keeps `script-src 'unsafe-inline'` because the App
Router's inline bootstrap needs it without per-response nonces. The directives
that do the real work — `frame-ancestors 'none'`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'` — are strict. If you add a third-party
script or analytics host, extend `script-src`/`connect-src` there rather than
loosening `default-src`.

### Dependency advisories

`npm audit --omit=dev` is clean except for **xlsx (SheetJS)**, which has no fix
published on npm. Both advisories (prototype pollution, ReDoS) are in the
*parsing* path. This app only ever writes:

```ts
// app/accounting/reports/page.tsx
XLSX.utils.json_to_sheet(rows) → XLSX.writeFile(wb, …)
```

No untrusted spreadsheet is ever parsed, so neither advisory is reachable. If
import-from-spreadsheet is ever added, switch to the SheetJS-hosted build first:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Applied in this pass: `next` 16.1.6 → 16.2.12 (several proxy/middleware auth
bypass advisories — directly relevant, since `proxy.ts` *is* the auth gate),
`next-auth` → 4.24.15, `nodemailer` → 9.0.3, plus `sharp`/`postcss` overrides.

### Still open

- **Prisma 5.22 → 7.x.** A two-major upgrade with a generator and client-API
  migration. Out of scope here; worth scheduling.
- **Sign-in rate limiting** is not implemented in the app. Use the Cloudflare
  rule above until it is.
- **`react-hooks/set-state-in-effect`** is downgraded to a warning in
  `eslint.config.mjs`. Eight list pages call an async `load()` from a mount
  effect and that loader opens with `setLoading(true)`. Fixing it means
  restructuring each page's data fetching, which is app behaviour work rather
  than deployment prep.
- **Legacy Supabase file URLs.** Rows written before this change still point at
  the old bucket. Nothing reads `NEXT_PUBLIC_SUPABASE_URL` any more, but if that
  project is torn down those images 404 until the objects are copied into R2 and
  the columns rewritten.

---

## 6. Local development

```bash
cp .env.example .env.local     # fill in real values
npm install
npx prisma migrate deploy
npm run seed                   # optional
npm run dev
```

Pre-push checks — the same three CI runs:

```bash
npm run typecheck && npm run lint && npm run build
```
