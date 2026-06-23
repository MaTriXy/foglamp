# Foglamp HUD — demo

A small **"AI Agents Console"** (React + [`@foglamp/ui`](../../packages/ui)) with the
Foglamp HUD overlaid on it. Run individual mock agents — or hit **Run storm** to fire a
staggered burst across all of them — and watch the HUD's bottom-center overlay stream
every run live: the timeline, overlapping-run clustering, the trace list, and per-run
waterfalls of steps + tool calls. No API key needed (deterministic mock models).

One agent (`support-copilot`) does the storyboard arc: looks up an order, **fails** to
refund it once (the HUD flashes red), retries successfully, then emails a receipt.

## Run it

```bash
# from the repo root — build the foglamp/hud client bundle once:
bun run --filter foglamp build

# build the demo frontend + serve it (this is the `start` script):
bun run --filter foglamp-example-hud-demo start
# → http://localhost:3344
```

Open the page, then click a card's **Run** — or **Run storm** in the header. Toggle the
theme (top-right) to see the HUD follow the app's light/dark.

> The demo's broker runs on **port 8518** (not the default 8517), so it coexists with a
> dashboard already running `foglamp({ hud: true })`.

## How it works

Two pieces, exactly what you'd add to your own app:

```ts
// server — opt into the HUD (dev only; ignored in prod/edge/serverless)
import { foglamp } from "foglamp";
const fog = foglamp({ hud: true });
// ...attach fog.integration({ agentName }) to your generateText/streamText calls
```

```tsx
// client — drop the overlay in anywhere
import { FoglampHUD } from "foglamp/hud";

<FoglampHUD />   // defaults: pill, port 8517, system theme
```

`foglamp({ hud: true })` starts a localhost **SSE broker**; `<FoglampHUD />` connects and
renders the live traces. No `FOGLAMP_API_KEY` required — with the HUD on but no key,
traces stream to the overlay only and are never sent to ingest.

## Layout

- `src/App.tsx` — the example UI (`@foglamp/ui` cards/buttons/badges + `<FoglampHUD />`).
- `src/agents.ts` — the agent catalog (shared by UI + server).
- `src/server/run.ts` — the mock agent runs (`generateText` + `fog.integration(...)`).
- `src/server.ts` — Bun server: serves the built app + `POST /api/run` / `POST /api/storm`.
- `vite.config.ts` / `index.css` — Vite + Tailwind v4 wiring for `@foglamp/ui`.

## Props

| prop | default | notes |
| --- | --- | --- |
| `port` | `8517` | must match `foglamp({ hudPort })` (the demo uses `8518`) |
| `defaultOpen` | `false` | start with the panel expanded |
| `theme` | `"system"` | `"light"` \| `"dark"` \| `"system"` (follows the host `.dark` class) |
| `redact` | `false` | mask tool payloads on screen — **turn on before recording / screen-sharing** |

## Verify (headless)

```bash
bun run --filter foglamp-example-hud-demo verify
```

Runs the `support-copilot` agent and asserts the live cascade (`lookup → refund fails →
refund retry → email`) streams over SSE — no browser needed.
