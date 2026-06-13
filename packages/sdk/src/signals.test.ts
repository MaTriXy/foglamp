import { describe, expect, test } from "bun:test";

import {
  extractRateLimit,
  extractSafetyMetadata,
  extractSources,
  extractSystemFingerprint,
  stepResponseHeaders,
} from "./signals";

const MAX = 1_000_000;

describe("extractSystemFingerprint", () => {
  test("reads OpenAI fingerprint (camel + snake)", () => {
    expect(
      extractSystemFingerprint({ providerMetadata: { openai: { systemFingerprint: "fp_abc" } } }),
    ).toBe("fp_abc");
    expect(
      extractSystemFingerprint({ providerMetadata: { openai: { system_fingerprint: "fp_xyz" } } }),
    ).toBe("fp_xyz");
  });
  test("falls back to experimental_providerMetadata", () => {
    expect(
      extractSystemFingerprint({
        experimental_providerMetadata: { openai: { systemFingerprint: "fp_5" } },
      }),
    ).toBe("fp_5");
  });
  test("absent when no fingerprint", () => {
    expect(extractSystemFingerprint({ providerMetadata: { anthropic: {} } })).toBeUndefined();
    expect(extractSystemFingerprint(undefined)).toBeUndefined();
    expect(extractSystemFingerprint({})).toBeUndefined();
  });
});

describe("extractSafetyMetadata", () => {
  test("captures Google safety ratings as JSON", () => {
    const ratings = [{ category: "HARM_CATEGORY_HATE", probability: "NEGLIGIBLE" }];
    const out = extractSafetyMetadata({ providerMetadata: { google: { safetyRatings: ratings } } }, MAX);
    expect(out).toBeDefined();
    expect(JSON.parse(out!)).toEqual({ google: ratings });
  });
  test("absent when no safety ratings", () => {
    expect(extractSafetyMetadata({ providerMetadata: { openai: {} } }, MAX)).toBeUndefined();
    expect(extractSafetyMetadata({}, MAX)).toBeUndefined();
  });
});

describe("extractSources", () => {
  test("serializes a non-empty sources array", () => {
    const sources = [{ sourceType: "url", url: "https://x.test", title: "X" }];
    const out = extractSources({ sources }, MAX);
    expect(out).toBeDefined();
    expect(JSON.parse(out!)).toEqual(sources);
  });
  test("absent when empty/missing", () => {
    expect(extractSources({ sources: [] }, MAX)).toBeUndefined();
    expect(extractSources({}, MAX)).toBeUndefined();
  });
});

describe("extractRateLimit", () => {
  test("normalizes OpenAI headers (duration resets)", () => {
    const headers = {
      "x-ratelimit-limit-requests": "60",
      "x-ratelimit-remaining-requests": "58",
      "x-ratelimit-reset-requests": "1s",
      "x-ratelimit-limit-tokens": "150000",
      "x-ratelimit-remaining-tokens": "149000",
      "x-ratelimit-reset-tokens": "6m0s",
    };
    const out = extractRateLimit(headers, 0);
    expect(out).toEqual({
      requestsLimit: 60,
      requestsRemaining: 58,
      requestsResetMs: 1_000,
      tokensLimit: 150_000,
      tokensRemaining: 149_000,
      tokensResetMs: 360_000,
    });
  });

  test("normalizes Anthropic headers (RFC3339 reset → ms until)", () => {
    const now = Date.parse("2026-06-13T00:00:00Z");
    const headers = {
      "anthropic-ratelimit-requests-limit": "1000",
      "anthropic-ratelimit-requests-remaining": "999",
      "anthropic-ratelimit-requests-reset": "2026-06-13T00:00:30Z",
      "anthropic-ratelimit-tokens-limit": "80000",
      "anthropic-ratelimit-tokens-remaining": "79000",
    };
    const out = extractRateLimit(headers, now);
    expect(out?.requestsLimit).toBe(1000);
    expect(out?.requestsResetMs).toBe(30_000);
    expect(out?.tokensRemaining).toBe(79_000);
    expect(out?.tokensResetMs).toBeUndefined();
  });

  test("supports a Headers-like object", () => {
    const headers = new Map<string, string>([["x-ratelimit-remaining-tokens", "42"]]);
    const get = (name: string) => headers.get(name) ?? null;
    const out = extractRateLimit({ get }, 0);
    expect(out).toEqual({ tokensRemaining: 42 });
  });

  test("absent when no rate-limit headers", () => {
    expect(extractRateLimit({ "content-type": "application/json" }, 0)).toBeUndefined();
    expect(extractRateLimit(undefined, 0)).toBeUndefined();
  });
});

describe("stepResponseHeaders", () => {
  test("reads response.headers", () => {
    const headers = { "x-ratelimit-limit-tokens": "10" };
    expect(stepResponseHeaders({ response: { headers } })).toBe(headers);
    expect(stepResponseHeaders({})).toBeUndefined();
  });
});
