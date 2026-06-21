# Foglamp HUD — demo

A floating, in-app overlay that streams your AI agent's execution **live** —
steps, tool calls, streaming tokens, and cost — rendered in the Foglamp
aesthetic, right on top of your web app. Dev/localhost only.

This demo runs a scripted support-copilot agent (no API key needed) that looks
up an order, **fails** to refund it the first time (the HUD flashes that step
red), retries successfully, then emails a receipt — the conflict-then-recovery
arc that makes for a good screen recording.

## Run it

```bash
# from the repo root — build the HUD client bundle once:
bun run --filter foglamp build

# then start the demo:
bun run --filter foglamp-example-hud-demo start
# → http://localhost:3344
```

Open the page and click **Run agent**. The HUD is docked bottom-right.

## How it works

Two pieces, exactly like you'd add to your own app:

```ts
// server: opt into the HUD (dev only; ignored in prod/edge/serverless)
import { foglamp } from "foglamp";
const fog = foglamp({ hud: true });
// ...attach fog.integration({ agentName }) to your generateText/streamText calls
```

```tsx
// client: drop the overlay in anywhere
import { FoglampHUD } from "foglamp/hud";

<FoglampHUD />          // defaults: launcher closed, port 8517, system theme
```

`foglamp({ hud: true })` starts a localhost **SSE broker** (default port `8517`);
`<FoglampHUD />` connects to it and renders the live trace. No API key required —
with the HUD on but no `FOGLAMP_API_KEY`, traces stream to the overlay only and
are not sent to ingest.

### Props

| prop | default | notes |
| --- | --- | --- |
| `port` | `8517` | must match `foglamp({ hudPort })` |
| `defaultOpen` | `false` | start with the panel open |
| `theme` | `"system"` | `"light"` \| `"dark"` \| `"system"` |
| `redact` | `false` | mask tool payloads on screen — **turn this on before recording / screen-sharing** |

## Recording tips

- Set `redact` if any real inputs/outputs would show on screen.
- The failing→recovering refund is the money shot — let it play through to the
  green "done" + cost in the footer.
- `theme="dark"` reads well over most apps.

## Verify (headless)

```bash
bun run --filter foglamp-example-hud-demo verify
```

Runs the agent and asserts the live cascade (`lookup → refund fails → refund
retry → email`) streams over SSE — no browser needed.
