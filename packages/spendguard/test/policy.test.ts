// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  evaluate,
  formatFlop,
  parseFlop,
  parsePolicy,
  parseRequest,
  type Policy,
  type Reservation,
} from "../src/policy";
import { policy, request } from "./helpers";

describe("exact input validation", () => {
  it.each([1, -1, "-1", "1e3", "NaN", "Infinity", " 1", "01", ".1", "1.", "0.0000000000000000001", "", null])(
    "rejects malformed money %s",
    (input) => expect(() => parseFlop(input)).toThrow(),
  );
  it("round trips values far beyond u128 and JavaScript's integer range", () => {
    const raw = 10n ** 180n + 123456789012345678n;
    expect(parseFlop(formatFlop(raw))).toBe(raw);
    expect(parseFlop("0.000000000000000001")).toBe(1n);
  });
  it("rejects missing and misspelled rules, bad lists and hostile requests", () => {
    expect(() => parsePolicy({ ...policy, maxPrice: "1" })).toThrow();
    expect(() => parsePolicy({ ...policy, cooldown: -1 })).toThrow();
    expect(() => parsePolicy({ ...policy, allowModels: ["model", "model"] })).toThrow();
    expect(() => parseRequest({ ...request, amount: "0" })).toThrow();
    expect(() => parseRequest({ ...request, at: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });
});

describe("each independent policy boundary", () => {
  const cases: { rule: string; change: Partial<Policy>; ledger?: Reservation[] }[] = [
    ...(["task", "hour", "day", "total"] as const).map((key) => ({
      rule: `budget.${key}`,
      change: { budgets: { ...policy.budgets, [key]: "0.999999999999999999" } },
    })),
    { rule: "maxPricePerGflop", change: { maxPricePerGflop: "0.099999999999999999" } },
    { rule: "maxEscrowPerSession", change: { maxEscrowPerSession: "0.999999999999999999" } },
    { rule: "allowModels", change: { allowModels: [] } },
    { rule: "allowMiners", change: { allowMiners: [] } },
    { rule: "denyMiners", change: { denyMiners: ["miner"] } },
    { rule: "modelCap", change: { modelCaps: { model: "0.9" } } },
    { rule: "minerCap", change: { minerCaps: { miner: "0.9" } } },
    { rule: "requireDryRun", change: { requireDryRun: true } },
    {
      rule: "cooldown",
      change: { cooldown: 100 },
      ledger: [{ request: { ...request, id: "earlier", at: request.at - 99 }, charged: "0", pending: false }],
    },
    {
      rule: "clock",
      change: {},
      ledger: [{ request: { ...request, id: "future", at: request.at + 1 }, charged: "0", pending: false }],
    },
    {
      rule: "uniqueId",
      change: {},
      ledger: [{ request: { ...request, at: request.at - 1 }, charged: "0", pending: false }],
    },
  ];
  it.each(cases)("$rule alone refuses a spend", ({ rule, change, ledger = [] }) => {
    const result = evaluate({ ...policy, ...change }, ledger, request);
    expect(result.decision).toBe("deny");
    expect(result.fired).toContain(rule);
  });
  it("collects all failing rules without short circuit", () => {
    const result = evaluate(
      { ...policy, allowModels: [], allowMiners: [], denyMiners: ["miner"], maxPricePerGflop: "0" },
      [],
      request,
    );
    expect(result.fired).toEqual(["maxPricePerGflop", "allowModels", "allowMiners", "denyMiners"]);
  });
  it("permits equality and denies one raw unit above it", () => {
    expect(evaluate(policy, [], { ...request, amount: "10" }).decision).toBe("allow");
    expect(evaluate(policy, [], { ...request, amount: "10.000000000000000001" }).decision).toBe("deny");
  });
  it("does not age unresolved reservations out of the hour or day", () => {
    const old = {
      request: { ...request, id: "old", at: 0, amount: "10" },
      charged: parseFlop("10").toString(),
      pending: true,
    };
    const result = evaluate(policy, [old], request);
    expect(result.fired).toContain("budget.hour");
    expect(result.fired).toContain("budget.day");
    expect(evaluate(policy, [{ ...old, pending: false }], request).fired).not.toContain("budget.hour");
  });
  it("defines exact rolling-window and cooldown boundaries", () => {
    const old = {
      request: { ...request, id: "old", at: request.at - 3_600_000, amount: "10" },
      charged: parseFlop("10").toString(),
      pending: false,
    };
    expect(evaluate(policy, [old], request).budgets.hour.used).toBe("0");
    expect(evaluate({ ...policy, cooldown: 3_600_000 }, [old], request).fired).not.toContain("cooldown");
  });
});

describe("generated accounting properties", () => {
  it("never overspends, never mutates inputs and is invariant under ledger permutation", () => {
    let seed = 7919;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed;
    };
    const ledger: Reservation[] = [];
    const large = formatFlop(10n ** 80n);
    const p = {
      ...policy,
      budgets: { task: large, hour: large, day: large, total: large },
      maxEscrowPerSession: large,
    };
    for (let i = 0; i < 500; i++) {
      const r = { ...request, id: `r${i}`, at: request.at + i, amount: formatFlop(BigInt(random()) * 10n ** 69n) };
      const before = structuredClone(ledger);
      const result = evaluate(p, ledger, r);
      expect(evaluate(p, [...ledger].reverse(), r)).toEqual(result);
      expect(ledger).toEqual(before);
      if (result.decision === "allow")
        ledger.push({ request: r, charged: parseFlop(r.amount).toString(), pending: true });
      expect(ledger.reduce((n, e) => n + BigInt(e.charged), 0n)).toBeLessThanOrEqual(parseFlop(large));
      for (const budget of Object.values(result.budgets))
        expect(parseFlop(budget.remaining)).toBeGreaterThanOrEqual(0n);
    }
  });
  it("rejects duplicate, negative and over-refunded ledger states", () => {
    const entry = { request, charged: "1", pending: true };
    expect(() => evaluate(policy, [entry, entry], request)).toThrow();
    expect(() => evaluate(policy, [{ ...entry, charged: "-1" }], request)).toThrow();
    expect(() => evaluate(policy, [{ ...entry, charged: parseFlop("2").toString() }], request)).toThrow();
  });
  it("rejects numeric ledger charges before JavaScript rounding can cross a raw-unit cap", () => {
    const malformed = { request: { ...request, id: "previous" }, charged: Number("9007199254740993"), pending: true };
    // Runtime callers can pass parsed JSON without the TypeScript type guarantee.
    expect(() => evaluate(policy, [malformed as unknown as Reservation], request)).toThrow();
  });
});
