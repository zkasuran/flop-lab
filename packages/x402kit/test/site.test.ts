// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { amountRatio, formatFlop, parsePreview } from "../../../apps/web/app/x402/data";
import run from "../fixtures/run.json";

describe("site observation boundary", () => {
  it("preserves recorded dates and exact raw amounts", () => {
    const p = parsePreview({ ...run.preview, mode: "recorded" });
    expect(p.measuredAt).toBe(run.preview.measuredAt);
    expect(p.rows).toEqual(run.preview.rows);
    expect(formatFlop("11796839999999999710")).toBe("11.79683999999999971");
    expect(formatFlop("1")).toBe("0.000000000000000001");
  });
  it("keeps empty observations empty", () => {
    const p = parsePreview({ ...run.preview, rows: [], mode: "live" });
    expect(p.rows).toEqual([]);
    expect(amountRatio("0", p.rows)).toBe(0);
  });
  it.each([
    { source: "https://untrusted.example" },
    { measuredAt: "not a date" },
    { mode: "verified" },
    { rows: [{ ...run.preview.rows[0], minerPaid: "-1" }] },
    { rows: [{ ...run.preview.rows[0], minerPaid: 1 }] },
    { rows: [{ ...run.preview.rows[0], settledBlock: Infinity }] },
    { rows: [{ ...run.preview.rows[0], escrowConserved: "true" }] },
    { rows: [run.preview.rows[0], run.preview.rows[0]] },
  ])("rejects malformed observation %j", (patch) => {
    expect(() => parsePreview({ ...run.preview, mode: "live", ...patch })).toThrow();
  });
  it("scales bars only against the observed sample", () => {
    const rows = run.preview.rows.map((r, i) => ({
      ...r,
      minerPaid: i === 0 ? "1000000000000000000" : "2000000000000000000",
    }));
    expect(amountRatio("1000000000000000000", rows)).toBe(0.5);
    expect(amountRatio("2000000000000000000", rows)).toBe(1);
  });
});
