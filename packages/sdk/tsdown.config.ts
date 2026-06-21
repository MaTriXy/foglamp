import { defineConfig } from "tsdown";

export default defineConfig({
  // Entry points: the v7 native-telemetry path (root), the v4+ wrapping path
  // (`foglamp/wrap`), the `foglamp` CLI bin (`npx foglamp login`), and the React
  // HUD overlay (`foglamp/hud`). Output paths mirror the entry keys; cli.ts
  // carries a shebang that tsdown preserves and marks executable.
  //
  // The HUD's *server* code (broker/relay/pricing, with `node:http` +
  // @foglamp/cost) is NOT an entry — it's reached only via the lazy
  // `import("./hud/relay")` in the collector, so rolldown code-splits it into
  // its own chunk that never loads on the edge/browser core path. The `hud`
  // entry here is the *client* component only.
  entry: {
    index: "./src/index.ts",
    "wrap/index": "./src/wrap/index.ts",
    cli: "./src/cli.ts",
    "hud/index": "./src/hud/react/index.tsx",
  },
  format: "esm",
  outDir: "./dist",
  dts: true,
  // Don't wipe dist on (re)build: `tsdown --watch` cleans on startup, which
  // briefly removes index.mjs and races consumers that import it at boot (e.g.
  // the server's `bun --hot` dev process → ENOENT). A single-entry build
  // overwrites in place, so cleaning buys nothing here.
  clean: false,
  // The published `.` entry intentionally has no workspace runtime deps — wire
  // types are mirrored locally in src/wire.ts (see contract-conformance.ts).
  // `ai` stays a peer dep. React + motion (used only by the `hud` entry) are
  // externalized so they're never bundled and resolve to the host app's copies —
  // critically, motion must NOT be pre-bundled or its optional Node require
  // (`@emotion/is-prop-valid`, `node:module`) breaks the app's bundler (Turbopack).
  external: [
    "ai",
    "@vercel/functions",
    "react",
    "react-dom",
    "react/jsx-runtime",
    "motion",
    "motion/react",
  ],
});
