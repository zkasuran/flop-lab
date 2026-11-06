// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { lintPolicy, lintPolicyText } from "../src/lint";
import { policy } from "./helpers";
const clean = { ...policy, maxEscrowPerSession: "5" };

it("accepts boundaries equal to the dated SDK reference", () => {
  const report = lintPolicy({ ...clean, budgets: { task: "50", hour: "50", day: "50", total: "50" } });
  expect(report.findings).toEqual([]);
  expect(report.reference.raw).toContain("dailyCap: 50n * 10n ** 18n");
  expect(report.reference.raw).toContain("perTxLimit: 5n * 10n ** 18n");
  expect(Date.parse(report.reference.measuredAt)).toBeGreaterThan(0);
});
it("flags both documented caps above the boundary by one raw unit", () => {
  const report = lintPolicy({
    ...clean,
    maxEscrowPerSession: "5.000000000000000001",
    budgets: { task: "100", hour: "100", day: "50.000000000000000001", total: "100" },
  });
  expect(report.findings.filter((f) => f.code === "above-reference").map((f) => f.path)).toEqual([
    "maxEscrowPerSession",
    "budgets.day",
  ]);
});
it("reports missing ceilings in decoded JSON and YAML before schema failure", () => {
  for (const report of [lintPolicy({}), lintPolicyText("version: 1")]) {
    expect(report.valid).toBe(false);
    expect(report.findings.filter((f) => f.code === "missing-ceiling")).toHaveLength(6);
  }
});
it("explains contradictions, shadowed caps and unreachable rules with fixes", () => {
  const report = lintPolicy({
    ...clean,
    allowModels: [],
    denyMiners: ["miner"],
    modelCaps: { ghost: "1" },
    minerCaps: { miner: "1" },
    budgets: { task: "20", hour: "30", day: "10", total: "0" },
  });
  expect(report.valid).toBe(true);
  expect(report.findings.map((f) => f.code)).toContain("contradiction");
  expect(report.findings.filter((f) => f.code === "unreachable").map((f) => f.path)).toEqual(
    expect.arrayContaining([
      "budgets.task",
      "budgets.hour",
      "budgets.day",
      "modelCaps.ghost",
      "minerCaps.miner",
      "maxEscrowPerSession",
    ]),
  );
  expect(report.findings.every((f) => f.fix.length > 0)).toBe(true);
});
it.each([null, [], { ...clean, maxEscrowPerSession: 5 }, { ...clean, surprise: true }])(
  "rejects hostile policy input",
  (input) => {
    expect(lintPolicy(input).valid).toBe(false);
  },
);
it("reports invalid YAML without throwing", () => {
  expect(lintPolicyText("&alias").findings[0]?.code).toBe("invalid");
});
