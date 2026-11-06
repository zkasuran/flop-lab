// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { filterMiners, ratio } from "../../../apps/web/app/metering/view";
import { recordedReport } from "../src/recorded";
it("preserves missing calibration and allows searching the recorded address", () => {
  const rows = recordedReport().miners;
  expect(filterMiners(rows, "missing", "")).toHaveLength(7);
  expect(filterMiners(rows, "present", "")).toHaveLength(63);
  expect(filterMiners(rows, "all", rows[0]!.address.toUpperCase())).toHaveLength(1);
  expect(filterMiners(rows, "all", "not-an-address")).toEqual([]);
});
it("keeps large exact accounting values out of floating point until the display ratio", () => {
  expect(ratio("90071992547409930000", "180143985094819860000")).toBe(0.5);
  expect(ratio("1", "0")).toBe(0);
  expect(ratio("2", "1")).toBe(1);
});
