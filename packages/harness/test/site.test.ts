// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { readRecording } from "../../../apps/web/app/harness/data";
import { counts, filterResults, reproduceCommand } from "../../../apps/web/app/harness/model";

describe("recorded harness view", () => {
  const report = readRecording();
  it("accepts the CLI recording and accounts for every result", () => {
    expect(report).not.toBeNull();
    const total = counts(report!.results);
    expect(total.PASS + total.FAIL + total.UNVERIFIABLE + total.SKIPPED).toBe(report!.results.length);
    expect(total.FAIL).toBe(
      report!.results.filter((result) => result.attempts.length === 2 && result.status === "FAIL").length,
    );
  });
  it("combines filters without treating skipped checks as verified", () => {
    const results = filterResults(report!.results, "FAIL", "mcp", "knowledge");
    expect(results.map((result) => result.claim.id)).toEqual(["mcp-knowledge-get"]);
    expect(filterResults(report!.results, "PASS", "mcp", "mcp-knowledge-get")).toEqual([]);
    expect(filterResults(report!.results, "ALL", "all", "no-such-claim")).toEqual([]);
  });
  it("keeps empty and flaky results distinct", () => {
    expect(counts([])).toEqual({ PASS: 0, FAIL: 0, UNVERIFIABLE: 0, SKIPPED: 0, FLAKY: 0 });
    const result = { ...report!.results[0]!, status: "UNVERIFIABLE" as const, flaky: true };
    expect(counts([result]).PASS).toBe(0);
    expect(filterResults([result], "FAIL", "all", "")).toEqual([]);
    expect(filterResults([result], "FLAKY", "all", "")).toEqual([result]);
  });
  it("shows no run for absent or malformed evidence metadata", () => {
    expect(readRecording(null)).toBeNull();
    for (const field of ["kind", "source"]) {
      const invalid = structuredClone(report!);
      Reflect.deleteProperty(invalid.results[0]!.claim, field);
      expect(readRecording(invalid)).toBeNull();
    }
    const unsafe = structuredClone(report!);
    unsafe.source = ["invalid-source"];
    expect(readRecording(unsafe)).toBeNull();
    unsafe.source = report!.source;
    unsafe.results[0]!.claim.source.url = "javascript:alert(1)";
    expect(readRecording(unsafe)).toBeNull();
    unsafe.results[0]!.claim.source.url = "https://mcp.flop.network/mcp";
    unsafe.results[0]!.claim.source.measuredAt = "not a date";
    expect(readRecording(unsafe)).toBeNull();
  });
  it("copies bounded workspace commands and refuses shell metacharacters", () => {
    expect(reproduceCommand("gateway-contract")).toBe(
      "pnpm --filter @flop-lab/harness start run --only gateway-contract --max-requests 100 --max-flop 0",
    );
    expect(() => reproduceCommand("gateway-contract;exit")).toThrow("Invalid claim id");
  });
});
