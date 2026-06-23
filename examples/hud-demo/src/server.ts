// Serves the built Vite app (dist/) and runs the mock agents. Importing
// ./server/run constructs foglamp({ hud: true, hudPort: 8518 }), which starts
// the local HUD broker so the overlay connects on load.
//
//   bun run start   (= vite build && bun run src/server.ts)  →  http://localhost:3344

import { runAgent, runStorm } from "./server/run";

const PORT = 3344;
const DIST = new URL("../dist/", import.meta.url);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/run") {
      const id = url.searchParams.get("agent");
      if (id) runAgent(id).catch((e) => console.error("run failed:", e));
      return new Response("ok");
    }
    if (req.method === "POST" && url.pathname === "/api/storm") {
      runStorm();
      return new Response("ok");
    }

    // Static assets from the Vite build; SPA fallback to index.html.
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const file = Bun.file(new URL(rel, DIST));
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(new URL("index.html", DIST)), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`\n  Foglamp HUD demo → http://localhost:${PORT}`);
console.log(`  HUD broker        → http://127.0.0.1:8518  (SSE)\n`);
console.log("  Open the page, then click a “Run” button (or “Run storm”).\n");
