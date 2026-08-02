import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * `unsafe-inline` for scripts is still required by the App Router's inline
 * bootstrap unless every response carries a nonce; `unsafe-eval` is needed only
 * by the dev-mode React refresh runtime. The high-value directives here are
 * `frame-ancestors`, `object-src`, `base-uri` and `form-action`, which shut down
 * clickjacking, plugin injection and form hijacking outright.
 *
 * `img-src` allows `blob:` because spreadsheet and barcode exports are generated
 * client-side as blobs.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Cloudflare terminates TLS in front of Vercel; HSTS is still emitted from the
  // origin so the policy travels with the app if the CDN is bypassed.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Self-hosted on Hetzner in Docker: emit `.next/standalone`, a self-contained
  // server plus only the traced node_modules. Ignored by Vercel, which builds
  // its own output format. See docker/Dockerfile.
  output: "standalone",

  // Don't advertise the framework version to scanners.
  poweredByHeader: false,

  // The reverse proxy in front of the app compresses: Vercel's edge does it, and
  // on Hetzner Caddy does it (`encode zstd gzip` in docker/Caddyfile).
  // Compressing again in Node would be wasted CPU.
  compress: false,

  // Trailing slashes off keeps one canonical URL per route, which matters once
  // Cloudflare is caching in front of the origin.
  trailingSlash: false,

  images: {
    // KYC documents are streamed from the authenticated /api/files route and are
    // rendered with `unoptimized`, so no remote patterns are required. Add an
    // entry here only if images start being served from a public host.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },

  // Next 16 dropped the `eslint` config key along with `next lint`; linting is a
  // standalone CI step (`npm run lint`).

  typescript: {
    // Type errors must fail the build.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Private documents must never land in Cloudflare's or a browser's
        // shared cache.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
