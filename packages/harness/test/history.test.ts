// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import seed from "../../recorder/test/fixtures/seed/index.json";
import { claimTimeline, fetchClaimHistory, parseClaimHistory } from "../src/history";

describe("recorder claim history", () => {
  it("reads recorded real runs and keeps every original measurement source", () => {
    const runs = parseClaimHistory(seed);
    const id = runs[0]!.claims[0]!.id;
    expect(claimTimeline(runs, id).map((point) => point.claim?.status)).toEqual(
      runs.map((run) => run.claims.find((claim) => claim.id === id)?.status),
    );
    expect(runs[0]!.claims[0]!.source).toMatch(/^https:/);
    runs[1]!.claims = [];
    expect(claimTimeline(runs, id)[1]!.claim).toBeNull();
  });
  it("rejects invalid, duplicate and oversized historical input", () => {
    expect(() => parseClaimHistory({ ...seed, version: 2 })).toThrow("version");
    expect(() => parseClaimHistory({ version: 1, entries: [seed.entries[0], seed.entries[0]] })).toThrow("duplicate");
    expect(() => parseClaimHistory({ version: 1, entries: Array(367).fill(seed.entries[0]) })).toThrow("limit");
    const corrupt = structuredClone(seed);
    corrupt.entries[0]!.claims[0]!.status = "MADE_UP";
    expect(() => parseClaimHistory(corrupt)).toThrow("status");
  });
  it("distinguishes absent branches, empty archives and failed reads", async () => {
    expect((await fetchClaimHistory(async () => new Response("404", { status: 404 }))).state).toBe("empty");
    expect((await fetchClaimHistory(async () => Response.json({ version: 1, entries: [] }))).runs).toEqual([]);
    expect((await fetchClaimHistory(async () => new Response("offline", { status: 503 }))).state).toBe("unavailable");
    expect((await fetchClaimHistory(async () => Response.json(seed))).state).toBe("recorded");
    expect((await fetchClaimHistory(async () => new Response("x".repeat(4_000_001)))).error).toContain("byte limit");
  });
});
