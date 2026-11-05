// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalogSeed,
  fillRatio,
  initialPolicy,
  parsePolicyText,
  replay,
  scenario,
} from "../../../apps/web/app/spendguard/library";

const recording = JSON.parse(
  readFileSync(new URL("../../../apps/web/tests/fixtures/models.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const seed = catalogSeed(recording);
if (!seed) throw new Error("Recorded catalogue has no identity");
const policy = parsePolicyText(initialPolicy(seed));
const steps = scenario(seed);

describe("recorded catalogue boundary", () => {
  it("uses observed identities and capture time, not token pricing", () => {
    expect(seed.model).toBe("qwen/qwen2.5-0.5b-instruct");
    expect(seed.miner).toBe("5CLkcYRxUBiLsrJg2Dapupx7qWWhPR3p5FmnwGtXDF1KQt3v");
    expect(seed.measuredAt).toBe(recording.measuredAt);
    expect(seed.priceSource).toBe("devnet-nominal");
    expect(policy.maxPricePerGflop).toBe("0.001");
    expect(steps[0]?.request.miner).toBe(seed.miner);
  });
  it("returns no data for an empty catalogue or an empty source list", () => {
    expect(catalogSeed({ ...recording, raw: '{"data":[]}' })).toBeNull();
    expect(catalogSeed({ ...recording, raw: '{"data":[{"id":"model","x-flop":{"price_sources":[]}}]}' })).toBeNull();
  });
  it.each([
    { status: 403 },
    { source: "https://example.com" },
    { measuredAt: "bad date" },
    { raw: "{" },
    { raw: "{}" },
    { raw: "x".repeat(200_001) },
    { raw: '{"data":[{"id":7}]}' },
    { raw: '{"data":[{"id":"x","x-flop":{"price_sources":[{"miner_address":"invalid"}]}}]}' },
  ])("fails closed on hostile or malformed observations: %j", (patch) => {
    expect(() => catalogSeed({ ...recording, ...patch })).toThrow();
  });
});

describe("browser replay accounting", () => {
  it("starts with an empty ledger and runs the default decision sequence", () => {
    expect(replay(policy, steps, 0).budgets.total.used).toBe("0");
    const result = replay(policy, steps, steps.length);
    expect(result.decisions.map((step) => step.result.decision)).toEqual([
      "allow",
      "allow",
      "deny",
      "allow",
      "deny",
      "deny",
    ]);
    expect(result.ledger).toHaveLength(3);
    expect(result.decisions.map((step) => step.reservedAfter)).toEqual([
      "0.01",
      "0.03",
      "0.03",
      "0.05",
      "0.05",
      "0.05",
    ]);
    expect(result.decisions[2]?.result.fired).toEqual(["budget.task"]);
    expect(result.decisions[4]?.result.fired).toEqual(["budget.hour", "maxPricePerGflop"]);
    expect(result.decisions[5]?.result.fired).toEqual(["budget.hour", "allowMiners", "denyMiners", "requireDryRun"]);
    expect(result.budgets.hour.remaining).toBe("0");
    expect(result.budgets.task.used).toBe("0.02");
  });
  it("never reserves a denied request or mutates scenario inputs", () => {
    const before = structuredClone(steps);
    const admitted = replay(policy, steps, 2);
    const denied = replay(policy, steps, 3);
    expect(denied.ledger).toEqual(admitted.ledger);
    expect(steps).toEqual(before);
    expect(denied.decisions[2]?.result.budgets.task.used).toBe("0.03");
  });
  it("replays from zero on policy edits instead of retaining invalid admissions", () => {
    const changed = parsePolicyText(initialPolicy(seed).replace('task: "0.03"', 'task: "0.009"'));
    const result = replay(changed, steps, steps.length);
    expect(result.ledger).toEqual([]);
    expect(result.budgets.total.used).toBe("0");
    expect(replay(policy, steps, steps.length).budgets.total.used).toBe("0.05");
  });
  it("shows exact large budgets while visual ratios stay finite and bounded", () => {
    const huge = "9".repeat(200);
    expect(fillRatio(huge, huge)).toBe(1);
    expect(fillRatio("0", huge)).toBe(0);
    expect(fillRatio("0.01", "0.03")).toBe(0.3333);
    expect(fillRatio("1", "0")).toBe(1);
    expect(fillRatio("0", "0")).toBe(0);
    expect(fillRatio("2", "1")).toBe(1);
  });
  it.each([-1, 0.5, 7, NaN])("rejects invalid replay positions: %s", (count) => {
    expect(() => replay(policy, steps, count)).toThrow();
  });
});
