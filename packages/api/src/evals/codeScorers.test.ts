import { describe, expect, test } from "bun:test";

import { runCodeScorer } from "./codeScorers";
import type { ExtractedContext } from "./types";

const ctx = (output: string): ExtractedContext => ({ input: "", output });
const pii = (output: string) => runCodeScorer("pii", ctx(output), {});
const refusal = (output: string) => runCodeScorer("no_refusal", ctx(output), {});

// `pii` fails (passed === false) when any pattern hits, and lists the hit keys
// in `reason`. These helpers assert on a *specific* pattern so an unrelated
// match can't make a test pass for the wrong reason.
const flagsAs = (output: string, key: string) => {
  const r = pii(output);
  return r.passed === false && r.reason.includes(key);
};
const flagsNothing = (output: string) => pii(output).passed === true;

describe("pii / phone", () => {
  test("does NOT flag bare numbers, decimals, prices, or dates", () => {
    // The original `\+?\d[\d ().-]{7,}\d` flagged all of these — the regression.
    expect(flagsNothing("Your order id is 1234567890.")).toBe(true);
    expect(flagsNothing("The value of pi is 3.14159265358979.")).toBe(true);
    expect(flagsNothing("That comes to 12.50 after tax.")).toBe(true);
    expect(flagsNothing("Released on 2023-01-15 to all users.")).toBe(true);
    expect(flagsNothing("Quantity: 1000000 units shipped.")).toBe(true);
  });

  test("flags genuinely phone-shaped numbers", () => {
    expect(flagsAs("Call me at 415-555-2671 tomorrow.", "phone")).toBe(true);
    expect(flagsAs("Reach the desk on (415) 555-2671.", "phone")).toBe(true);
    expect(flagsAs("My cell is +14155552671, text anytime.", "phone")).toBe(true);
    expect(flagsAs("London office: +44 20 7946 0958.", "phone")).toBe(true);
  });
});

describe("pii / credit_card", () => {
  test("flags only Luhn-valid card numbers", () => {
    // 4111 1111 1111 1111 is the canonical Visa test number (Luhn-valid).
    expect(flagsAs("Pay with 4111 1111 1111 1111 today.", "credit_card")).toBe(true);
    expect(flagsAs("Card: 4111111111111111", "credit_card")).toBe(true);
  });

  test("does NOT flag long non-card numbers", () => {
    // 13-digit ms timestamp and a sequential 16-digit id — both fail Luhn, so
    // neither should flag (the old `\b(?:\d[ -]?){13,16}\b` flagged both).
    expect(flagsNothing("Logged at 1700000000000 (epoch ms).")).toBe(true);
    expect(flagsNothing("Reference number 1234567890123456.")).toBe(true);
  });
});

describe("pii / other matchers still work after the predicate refactor", () => {
  test("email and ssn (regex matchers) still flag", () => {
    expect(flagsAs("Email me at jane.doe@example.com.", "email")).toBe(true);
    expect(flagsAs("SSN on file: 123-45-6789.", "ssn")).toBe(true);
  });
});

describe("no_refusal", () => {
  test("flags refusals across phrasings", () => {
    const refusals = [
      "I'm sorry, but I can't help with that.",
      "I cannot assist with that request.",
      "I won't provide that information.",
      "I'm unable to comply.",
      "As an AI language model, I cannot do that.",
      "I must decline.",
      "That goes against my guidelines.",
    ];
    for (const r of refusals) {
      expect(refusal(r).passed).toBe(false);
    }
  });

  test("does NOT flag helpful answers or non-refusal empathy", () => {
    const ok = [
      "Sure! Use reversed() to reverse a list in Python.",
      "I can help you with that — here are three options.",
      "I'm sorry to hear that happened. Here's how to fix it:",
      "Happy to assist! The capital of France is Paris.",
    ];
    for (const o of ok) {
      expect(refusal(o).passed).toBe(true);
    }
  });
});
