// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import snapshot from "../fixtures/devnet.json";
import { auditSnapshot } from "../src/audit";
import { stakeArithmetic, visibleFindings } from "../../../apps/web/app/indexer/view";

describe("invariant board projection", () => {
  const report = auditSnapshot(snapshot);
  it("filters recorded results without changing verdicts or input order", () => {
    const before = structuredClone(report.findings);
    const failed = visibleFindings(report.findings, "FAIL");
    expect(failed.map((f) => f.id)).toEqual(["stake-miners"]);
    expect(visibleFindings(report.findings, "ALL")[0]?.id).toBe("stake-miners");
    expect(visibleFindings(report.findings, "UNVERIFIABLE")).toHaveLength(report.counts.UNVERIFIABLE);
    expect(report.findings).toEqual(before);
    expect(visibleFindings([], "FAIL")).toEqual([]);
  });
  it("shows the exact source summands rather than a rounded money total", () => {
    expect(stakeArithmetic(report.snapshot, "miners")).toBe(
      "3260130000000000000000000 + 0 + 60167023000000000000000000 = 63427153000000000000000000 raw planck",
    );
    expect(stakeArithmetic({ ...report.snapshot, observations: [] }, "miners")).toBeNull();
    const bad = structuredClone(report.snapshot);
    bad.observations.find((o) => o.id === "staking")!.raw = '{"miners":{"selfStake":1}}';
    expect(stakeArithmetic(bad, "miners")).toBeNull();
  });
});
