// The HUD's stylesheet, injected into a Shadow DOM root so it can't collide with
// (or be restyled by) the host app. Tokens are vendored from the Foglamp design
// system (packages/ui/src/styles/globals.css): neutral oklch surfaces, soft
// shadow rings, squircle radii, emerald/rose status, tabular figures. No neon.

export const HUD_CSS = /* css */ `
:host {
  /* light (default) */
  --fl-bg: oklch(1 0 0);
  --fl-fg: oklch(0.205 0 0);
  --fl-muted: oklch(0.556 0 0);
  --fl-subtle: oklch(0.97 0 0);
  --fl-border: oklch(0.922 0 0);
  --fl-ok: oklch(0.7 0.15 162);
  --fl-ok-bg: oklch(0.95 0.05 162);
  --fl-err: oklch(0.64 0.21 16);
  --fl-err-bg: oklch(0.95 0.04 16);
  --fl-ring: 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 4px 0 rgba(0,0,0,0.04);
  --fl-shadow: 0 10px 30px -10px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);

  all: initial;
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  color-scheme: light;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fl-fg);
  -webkit-font-smoothing: antialiased;
}
:host([data-theme="dark"]) {
  --fl-bg: oklch(0.205 0 0);
  --fl-fg: oklch(0.97 0 0);
  --fl-muted: oklch(0.62 0 0);
  --fl-subtle: oklch(0.27 0 0);
  --fl-border: oklch(0.31 0 0);
  --fl-ok: oklch(0.72 0.15 162);
  --fl-ok-bg: oklch(0.30 0.05 162);
  --fl-err: oklch(0.68 0.2 16);
  --fl-err-bg: oklch(0.30 0.06 16);
  --fl-ring: 0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px -1px rgba(0,0,0,0.4);
  --fl-shadow: 0 10px 30px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
  color-scheme: dark;
}

* { box-sizing: border-box; }

.fl-launcher {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px 0 11px;
  background: var(--fl-bg);
  color: var(--fl-fg);
  border: none;
  border-radius: 11px;
  box-shadow: var(--fl-ring);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.fl-launcher:hover { transform: translateY(-1px); box-shadow: var(--fl-shadow); }
.fl-launcher:active { transform: translateY(0); }

.fl-mark { width: 12px; height: 12px; border-radius: 4px; background: var(--fl-muted); }
.fl-mark.run { background: var(--fl-ok); animation: fl-pulse 1.1s ease-in-out infinite; }
.fl-mark.err { background: var(--fl-err); }

.fl-count {
  min-width: 18px; height: 18px; padding: 0 5px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px; background: var(--fl-subtle); color: var(--fl-muted);
  font-size: 11px; font-variant-numeric: tabular-nums;
}

.fl-panel {
  width: 380px;
  max-width: calc(100vw - 32px);
  max-height: min(560px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  background: var(--fl-bg);
  border-radius: 16px;
  box-shadow: var(--fl-shadow);
  overflow: hidden;
  animation: fl-rise 0.18s cubic-bezier(0.32, 0.72, 0, 1);
}

.fl-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--fl-border);
}
.fl-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.fl-title b { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-title span { color: var(--fl-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.fl-conn { width: 7px; height: 7px; border-radius: 50%; background: var(--fl-muted); flex: none; }
.fl-conn.on { background: var(--fl-ok); }
.fl-conn.off { background: var(--fl-err); }

.fl-icon-btn {
  width: 26px; height: 26px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: var(--fl-muted);
  border-radius: 7px; cursor: pointer; font: inherit; font-size: 15px;
}
.fl-icon-btn:hover { background: var(--fl-subtle); color: var(--fl-fg); }

.fl-armory { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 12px; border-bottom: 1px solid var(--fl-border); }
.fl-chip {
  padding: 2px 8px; border-radius: 999px; font-size: 11px;
  background: var(--fl-subtle); color: var(--fl-muted);
  border: 1px solid var(--fl-border); transition: all 0.15s ease;
}
.fl-chip.used { background: var(--fl-ok-bg); color: var(--fl-ok); border-color: transparent; }

.fl-tree { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }

.fl-row {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border-radius: 9px;
  animation: fl-fade-in 0.22s ease both;
}
.fl-row.tool { margin-left: 16px; }
.fl-row.err { background: var(--fl-err-bg); animation: fl-fade-in 0.22s ease both, fl-flash 0.6s ease 1; }

.fl-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--fl-muted); }
.fl-dot.run { background: var(--fl-ok); animation: fl-pulse 1.1s ease-in-out infinite; }
.fl-dot.ok { background: var(--fl-ok); }
.fl-dot.err { background: var(--fl-err); }

.fl-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fl-row-label { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-row-label b { font-weight: 600; }
.fl-row-sub { color: var(--fl-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-row-meta { color: var(--fl-muted); font-size: 11px; font-variant-numeric: tabular-nums; flex: none; text-align: right; }

.fl-footer {
  display: flex; gap: 4px; padding: 9px 12px;
  border-top: 1px solid var(--fl-border);
}
.fl-stat { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.fl-stat b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fl-stat span { color: var(--fl-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
.fl-stat.err b { color: var(--fl-err); }

.fl-empty { padding: 28px 16px; text-align: center; color: var(--fl-muted); font-size: 12px; }

@keyframes fl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes fl-rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes fl-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes fl-flash { 0% { background: var(--fl-err-bg); } 35% { background: var(--fl-err); } 100% { background: var(--fl-err-bg); } }

@media (prefers-reduced-motion: reduce) {
  .fl-mark.run, .fl-dot.run { animation: none; }
  .fl-panel, .fl-row { animation: none; }
}
`;
