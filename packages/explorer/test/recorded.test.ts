// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseExploration } from "../src/report";
import { recordedExploration } from "../src/recorded";
import { SearchBudget } from "../src/budget";

describe("recorded searches", () => {
  it.each(["block", "transaction", "account", "channel", "htlc"] as const)(
    "validates the %s recording and its raw data",
    (kind) => {
      const r = recordedExploration(kind);
      expect(r.entities[0]?.kind).toBe(kind);
      expect(r.mode).toBe("recorded");
      expect(r.lookups[0]?.source).toBe("https://mcp.flop.network/mcp");
    },
  );
  it("rejects tampered display data and malformed metadata", () => {
    const r = recordedExploration("channel");
    (r.entities[0]!.evidence[0]!.data as Record<string, unknown>).escrow = "42";
    expect(() => parseExploration(r)).toThrow("differs");
    for (const v of [
      null,
      {},
      { ...recordedExploration("htlc"), requests: -1 },
      { ...recordedExploration("htlc"), mode: "made-up" },
    ])
      expect(() => parseExploration(v)).toThrow();
  });
  it("enforces visitor and global budgets across a window boundary", () => {
    let now = 100000;
    const budget = new SearchBudget(() => now);
    expect([1, 2, 3].map(() => budget.take("a").allowed)).toEqual([true, true, true]);
    expect(budget.take("a")).toEqual({ allowed: false, retryAfter: 60 });
    for (let i = 0; i < 9; i++) expect(budget.take(String(i)).allowed).toBe(true);
    expect(budget.take("new").allowed).toBe(false);
    now += 59999;
    expect(budget.take("a").allowed).toBe(false);
    now += 1;
    expect(budget.take("a").allowed).toBe(true);
  });
});
