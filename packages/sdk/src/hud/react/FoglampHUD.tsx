"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatCost, formatDuration, formatTokens, formatTps } from "./format";
import { rows, type HudStep, type HudToolCall, type HudTrace, type RunStatus } from "./model";
import { HUD_CSS } from "./styles";
import { useHudStream, type ConnStatus } from "./useHudStream";

export interface FoglampHUDProps {
  /** Broker port — must match `foglamp({ hudPort })`. Default 8517. */
  port?: number;
  /** Start with the panel open. Default false (launcher only). */
  defaultOpen?: boolean;
  /** Color theme. "system" follows the OS. Default "system". */
  theme?: "light" | "dark" | "system";
  /**
   * Mask prompt/response/tool payloads on screen — set this before recording a
   * demo or sharing your screen so inputs/outputs/errors never leak.
   */
  redact?: boolean;
}

const DEFAULT_PORT = 8517;

/**
 * Floating overlay that streams live agent execution from the local Foglamp
 * broker. Renders into a Shadow DOM root appended to <body> so its styles are
 * fully isolated from (and can't be restyled by) the host app. Dev-only: it's
 * inert unless a broker is running (`foglamp({ hud: true })`).
 */
export function FoglampHUD(props: FoglampHUDProps): React.ReactNode {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  // Create the shadow host once.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("foglamp-hud");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = HUD_CSS;
    shadow.appendChild(style);
    const mountEl = document.createElement("div");
    shadow.appendChild(mountEl);
    document.body.appendChild(host);
    hostRef.current = host;
    setMount(mountEl);
    return () => {
      host.remove();
      hostRef.current = null;
    };
  }, []);

  // Reflect the resolved theme onto the host so :host([data-theme]) applies.
  const theme = props.theme ?? "system";
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (theme !== "system") {
      host.setAttribute("data-theme", theme);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => host.setAttribute("data-theme", mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, mount]);

  if (!mount) return null;
  return createPortal(<HudApp {...props} />, mount);
}

function HudApp(props: FoglampHUDProps) {
  const port = props.port ?? DEFAULT_PORT;
  const { state, conn } = useHudStream(port);
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active = state.traces[0];
  const running = state.traces.some((t) => t.status === "running");

  // Tick while something runs so live durations advance.
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  if (!open) {
    return (
      <Launcher
        running={running}
        lastError={active?.status === "error"}
        count={state.traces.length}
        onClick={() => setOpen(true)}
      />
    );
  }
  return (
    <Panel
      trace={active}
      conn={conn}
      redact={props.redact ?? false}
      onClose={() => setOpen(false)}
    />
  );
}

function Launcher({
  running,
  lastError,
  count,
  onClick,
}: {
  running: boolean;
  lastError: boolean;
  count: number;
  onClick: () => void;
}) {
  const markClass = running ? "fl-mark run" : lastError ? "fl-mark err" : "fl-mark";
  return (
    <button type="button" className="fl-launcher" onClick={onClick} aria-label="Open Foglamp HUD">
      <span className={markClass} />
      <span>Foglamp</span>
      {count > 0 && <span className="fl-count">{count}</span>}
    </button>
  );
}

function Panel({
  trace,
  conn,
  redact,
  onClose,
}: {
  trace: HudTrace | undefined;
  conn: ConnStatus;
  redact: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fl-panel" role="dialog" aria-label="Foglamp HUD">
      <div className="fl-header">
        <span className={`fl-conn ${conn === "open" ? "on" : conn === "closed" ? "off" : ""}`} />
        <div className="fl-title">
          <b>{trace ? trace.agentName ?? trace.name : "Foglamp"}</b>
          <span>{trace?.model ?? (conn === "open" ? "waiting for a run…" : "connecting…")}</span>
        </div>
        <button type="button" className="fl-icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {trace && trace.toolNames.length > 0 && (
        <div className="fl-armory">
          {trace.toolNames.map((name) => {
            const used = trace.tools.some((t) => t.toolName === name);
            return (
              <span key={name} className={used ? "fl-chip used" : "fl-chip"}>
                {name}
              </span>
            );
          })}
        </div>
      )}

      <div className="fl-tree">
        {!trace ? (
          <div className="fl-empty">
            {conn === "open" ? "Run an agent to see it light up." : "Connecting to the local broker…"}
          </div>
        ) : (
          rows(trace).map((row) =>
            row.kind === "step" ? (
              <StepRow key={row.key} step={row.step} />
            ) : (
              <ToolRow key={row.key} tool={row.tool} redact={redact} />
            ),
          )
        )}
      </div>

      {trace && <Footer trace={trace} />}
    </div>
  );
}

function dotClass(status: RunStatus): string {
  return `fl-dot ${status}`;
}

function StepRow({ step }: { step: HudStep }) {
  const meta = [
    step.ttftMs != null ? `ttft ${formatDuration(step.ttftMs)}` : null,
    step.outputTokens > 0 ? `${formatTokens(step.outputTokens)} tok` : null,
    step.outputTps != null ? formatTps(step.outputTps) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`fl-row ${step.status === "error" ? "err" : ""}`}>
      <span className={dotClass(step.status)} />
      <div className="fl-row-main">
        <span className="fl-row-label">
          <b>Step {step.stepNumber + 1}</b>
        </span>
        {meta && <span className="fl-row-sub">{meta}</span>}
      </div>
      <span className="fl-row-meta">{formatDuration(step.durationMs)}</span>
    </div>
  );
}

function ToolRow({ tool, redact }: { tool: HudToolCall; redact: boolean }) {
  const sub =
    tool.status === "error"
      ? redact
        ? "error"
        : tool.errorMessage ?? "error"
      : redact
        ? tool.output
          ? "•••"
          : undefined
        : preview(tool.output);
  return (
    <div className={`fl-row tool ${tool.status === "error" ? "err" : ""}`}>
      <span className={dotClass(tool.status)} />
      <div className="fl-row-main">
        <span className="fl-row-label">
          <b>{tool.toolName}</b>
        </span>
        {sub && <span className="fl-row-sub">{sub}</span>}
      </div>
      <span className="fl-row-meta">{formatDuration(tool.durationMs)}</span>
    </div>
  );
}

function Footer({ trace }: { trace: HudTrace }) {
  const t = trace.totals;
  const outputTokens =
    t?.outputTokens ?? trace.steps.reduce((sum, s) => sum + s.outputTokens, 0);
  const durationMs = t?.durationMs ?? (trace.endedAt ?? Date.now()) - trace.startedAt;
  const hasError = trace.status === "error";
  return (
    <div className="fl-footer">
      <div className="fl-stat">
        <b>{formatTokens(outputTokens)}</b>
        <span>tokens</span>
      </div>
      <div className="fl-stat">
        <b>{formatCost(t?.costUsd)}</b>
        <span>cost</span>
      </div>
      <div className={`fl-stat ${hasError ? "err" : ""}`}>
        <b>{formatDuration(durationMs)}</b>
        <span>{trace.status === "running" ? "running" : hasError ? "failed" : "done"}</span>
      </div>
    </div>
  );
}

// First line / first ~48 chars of a serialized payload, for the row subtitle.
function preview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}
