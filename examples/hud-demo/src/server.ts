// Tiny dev server for the HUD demo. Serves the page + the built HUD component,
// and runs the scripted agent on POST /run. Importing ./agent constructs
// `foglamp({ hud: true })`, which eagerly starts the local HUD broker on :8517 —
// so the overlay connects as soon as the page loads.
//
//   bun run start   →   http://localhost:3344

import { runDemoAgent } from "./agent";

const PORT = 3344;
const INDEX = new URL("../public/index.html", import.meta.url);
// The built `foglamp/hud` client bundle (run `bun run build` in packages/sdk first).
const HUD_MJS = new URL("../../../packages/sdk/dist/hud/index.mjs", import.meta.url);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/run" && req.method === "POST") {
      runDemoAgent().catch((error) => console.error("agent run failed:", error));
      return new Response("ok");
    }
    if (url.pathname === "/hud.mjs") {
      return new Response(Bun.file(HUD_MJS), {
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }
    return new Response(Bun.file(INDEX), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`\n  Foglamp HUD demo → http://localhost:${PORT}`);
console.log(`  HUD broker        → http://127.0.0.1:8517  (SSE)\n`);
console.log("  Open the page, then click “Run agent”.\n");
