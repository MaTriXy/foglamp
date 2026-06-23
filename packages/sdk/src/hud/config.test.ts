import { afterEach, describe, expect, test } from "bun:test";

import { resolveConfig } from "../config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("hud config gating", () => {
  test("enabled in a plain Node dev process via hud:true (no API key needed)", () => {
    delete process.env.FOGLAMP_API_KEY;
    delete process.env.NODE_ENV;
    const c = resolveConfig({ hud: true });
    expect(c.hud).toBe(true);
    expect(c.active).toBe(true);
    expect(c.enabled).toBe(false); // no key → ingest off, HUD still on
    expect(c.hudPort).toBe(8517);
  });

  test("disabled in production", () => {
    process.env.NODE_ENV = "production";
    expect(resolveConfig({ hud: true }).hud).toBe(false);
  });

  test("disabled on serverless / edge runtimes", () => {
    process.env.VERCEL = "1";
    expect(resolveConfig({ hud: true }).hud).toBe(false);
    delete process.env.VERCEL;
    process.env.NEXT_RUNTIME = "edge";
    expect(resolveConfig({ hud: true }).hud).toBe(false);
  });

  test("opt-in via FOGLAMP_HUD env, and custom port via FOGLAMP_HUD_PORT", () => {
    delete process.env.NODE_ENV;
    process.env.FOGLAMP_HUD = "1";
    process.env.FOGLAMP_HUD_PORT = "9000";
    const c = resolveConfig({});
    expect(c.hud).toBe(true);
    expect(c.hudPort).toBe(9000);
  });

  test("off by default (no opt-in)", () => {
    delete process.env.FOGLAMP_HUD;
    delete process.env.NODE_ENV;
    expect(resolveConfig({ apiKey: "fl_x" }).hud).toBe(false);
  });
});
