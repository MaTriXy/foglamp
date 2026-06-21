// `foglamp/hud` — the React HUD overlay. Drop <FoglampHUD /> into any client
// component; pair it with `foglamp({ hud: true })` on the server. Dev/localhost
// only — inert unless a local broker is running.

export { FoglampHUD, type FoglampHUDProps } from "./FoglampHUD";
export type { HudTrace, HudStep, HudToolCall, RunStatus } from "./model";
