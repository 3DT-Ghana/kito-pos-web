import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma generated client — not our code
    "lib/generated/**",
    // Standalone browser scratch script, not part of the build
    "discount-test.mjs",
    // Vendored third-party scripts served as-is. qz-tray.js is the upstream QZ
    // Tray Connector (LGPL); it is neither transpiled nor bundled, so our
    // TypeScript rules do not apply, and its lone require() sits in a Node-only
    // branch that never executes in the browser. Editing it to satisfy the
    // linter would mean maintaining a fork of a library we only consume.
    "public/**",
    // Vendored QZ Tray client library — not our code
    "public/qz-tray.js",
  ]),
  {
    rules: {
      /**
       * Downgraded to a warning, not disabled.
       *
       * Eight list pages call an async `load()` from a mount effect, and that
       * loader opens with `setLoading(true)`. Fixing it properly means
       * restructuring each page's data fetching (cancellation, initial state) —
       * worth doing, but it is app behaviour work rather than deployment prep,
       * and it should not be smuggled into a release that cannot be exercised
       * against a live database. Tracked in DEPLOYMENT.md → "Still open".
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
