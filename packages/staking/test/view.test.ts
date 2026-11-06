// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { recordedReport } from "../src/recorded";
import { barRatio, filterMiners } from "../../../apps/web/app/staking/view";

it("bounds visual ratios while keeping exact large inputs", () => {
  expect(barRatio("0", "0")).toBe(0);
  expect(barRatio("3", "2")).toBe(1);
  expect(barRatio("9007199254740993", "18014398509481986")).toBe(0.5);
  expect(() => barRatio("NaN", "1")).toThrow();
});
it("filters missing evidence without changing recorded verdicts", () => {
  const rows = recordedReport().miners;
  const original = structuredClone(rows);
  expect(filterMiners(rows, "missing", "").every((m) => m.capacityGflop === null)).toBe(true);
  expect(filterMiners(rows, "calibrated", "").every((m) => m.capacityGflop !== null)).toBe(true);
  expect(filterMiners(rows, "all", rows[0]!.address)).toEqual([rows[0]]);
  expect(filterMiners([], "missing", "")).toEqual([]);
  expect(filterMiners(rows, "all", "not-an-address")).toEqual([]);
  expect(rows).toEqual(original);
});
