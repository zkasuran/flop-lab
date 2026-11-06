// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { parseReplayEvent, visibleEntries } from "../../../apps/web/app/invariants/view";
import { GET, POST } from "../../../apps/web/app/invariants/replay/route";
import { runChecks } from "../src/index";

it("validates replay messages and rejects malformed completion or check counts", () => {
  expect(parseReplayEvent({ suite: "spec", checks: 0 })).toEqual({ suite: "spec", checks: 0 });
  expect(parseReplayEvent({ done: true, evaluatedAt: "2026-11-05T00:00:00Z" })).toHaveProperty("done", true);
  for (const value of [
    null,
    {},
    { suite: "unknown", checks: 1 },
    { suite: "verifier", checks: -1 },
    { done: true, evaluatedAt: "bad" },
  ])
    expect(() => parseReplayEvent(value)).toThrow();
});

it("filters quoted source rows without changing evidence outcomes", async () => {
  const report = await runChecks();
  expect(visibleEntries(report.entries, "model swap", "OBSERVED", "failure").map((r) => r.id)).toEqual(["M1"]);
  expect(visibleEntries(report.entries, "", "ALL", "failure")).toHaveLength(54);
  expect(visibleEntries(report.entries, "no-such-rule", "ALL", "ALL")).toEqual([]);
  expect(visibleEntries(report.entries, "", "MISMATCH", "ALL")).toEqual([]);
});

it("streams each actual library completion and downloads replayable native input", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No external requests"));
  try {
    const response = POST();
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => parseReplayEvent(JSON.parse(line)));
    expect(events).toHaveLength(5);
    expect(events.slice(0, 4).map((event) => ("suite" in event ? event.suite : null))).toEqual([
      "verifier",
      "indexer",
      "harness",
      "spec",
    ]);
    expect(events[4]).toHaveProperty("done", true);
    const download = GET();
    expect(download.headers.get("content-disposition")).toContain("invariant-inputs.json");
    const report = await runChecks(await download.json());
    expect(report.counts.OBSERVED).toBe(18);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
