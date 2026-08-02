# syntax=docker/dockerfile:1
#
# Production image for the Next.js app, built on the Hetzner host by the
# self-hosted GitHub Actions runner.
#
# Three stages:
#   deps    — lockfile-exact install (also runs `prisma generate` via postinstall)
#   builder — `next build`; also the image used to run `prisma migrate deploy`
#   runner  — the standalone server only, no npm, no source, non-root
#
# The build never sees production secrets. `lib/env.ts` validates lazily, on
# first read, precisely so a build machine without credentials can compile.

ARG NODE_VERSION=22-bookworm-slim

# ─────────────────────────────────────────────────────────────── deps ──
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Prisma's engines are dynamically linked against OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Placeholders only. `prisma generate` parses schema.prisma and fails validation
# if the datasource env vars are absent — it never opens a connection.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build"

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ──────────────────────────────────────────────────────────── builder ──
FROM deps AS builder
WORKDIR /app

COPY . .

# Same placeholder set CI uses. Present and well-formed, never reachable.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_SECRET="build-placeholder-secret-that-is-long-enough-000" \
    NEXTAUTH_URL="http://localhost:3000" \
    R2_ACCOUNT_ID="build" \
    R2_ACCESS_KEY_ID="build" \
    R2_SECRET_ACCESS_KEY="build" \
    R2_BUCKET="build"

RUN npx prisma generate && npx next build

# ───────────────────────────────────────────────────────────── runner ──
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Baked in at build time so /api/health can report which commit is live.
ARG APP_COMMIT_SHA=""
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}

COPY --from=builder --chown=node:node /app/public ./public

# `.next` must be writable by the app user for the prerender/ISR cache.
RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Output file tracing usually pulls the Prisma query engine into `standalone`,
# but it is a native .node binary resolved at runtime — copying the generated
# client explicitly removes any dependency on the tracer getting that right.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

USER node
EXPOSE 3000

# Reports 503 when the database is unreachable or config is incomplete, so an
# unhealthy container here means a genuinely unserviceable app.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
