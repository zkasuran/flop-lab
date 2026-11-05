// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import recorded from "../fixtures/channel-1.json";
import { createEvidenceService } from "../../../apps/web/app/verify/service";
import { channelInput, parseEvidence, recentInput, verifyEvidence } from "../../../apps/web/app/verify/library";
import type { TapeReport } from "../src/fetcher";

const bundle = parseEvidence(recorded);
function setup() {
  const stats = { requests: 0, retries: 0, failures: 0 };
  const collector = {
    stats,
    channel: vi.fn(async () => {
      stats.requests += 8;
      return bundle;
    }),
    tape: vi.fn(async (): Promise<TapeReport> => {
      stats.requests++;
      return {
        capturedAt: bundle.capturedAt,
        source: "https://mcp.flop.network/mcp",
        requestedLimit: 6,
        rows: [{ channelId: bundle.channelId, checks: [] }],
        observations: [],
        complete: false,
        errors: [],
        exitCode: 3,
      };
    }),
  };
  let now = 0;
  return {
    collector,
    read: createEvidenceService(collector, () => now),
    advance: () => {
      now += 30_001;
    },
  };
}

describe("site evidence boundary", () => {
  it("rejects bad channel input before making a public call", async () => {
    const { read, collector } = setup();
    for (const value of ["https://example.invalid", "0x01", "", "0x" + "g".repeat(64)])
      expect((await read(value)).status).toBe(400);
    expect(collector.channel).not.toHaveBeenCalled();
    expect(collector.tape).not.toHaveBeenCalled();
    expect(channelInput(` ${bundle.channelId.toUpperCase()} `)).toBe(bundle.channelId);
  });

  it("bounds channel capture, coalesces it and keeps original measurement dates on cache hits", async () => {
    const { read, collector, advance } = setup();
    const [a, b] = await Promise.all([read(bundle.channelId), read(bundle.channelId)]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 200, body: { bundle, requests: 8 } });
    expect(collector.channel).toHaveBeenCalledExactlyOnceWith(bundle.channelId, { maxRows: 100 });
    expect(await read(bundle.channelId)).toEqual(a);
    expect(collector.channel).toHaveBeenCalledTimes(1);
    advance();
    await read(bundle.channelId);
    expect(collector.channel).toHaveBeenCalledTimes(2);
  });

  it("rejects competing collection instead of multiplying public requests", async () => {
    const { read, collector } = setup();
    const first = read(bundle.channelId);
    expect((await read("recent")).status).toBe(429);
    expect(collector.tape).not.toHaveBeenCalled();
    await first;
    expect((await read("recent")).status).toBe(200);
  });

  it("caches collection failures and releases the concurrency slot", async () => {
    const { read, collector, advance } = setup();
    collector.channel.mockRejectedValue(new Error("offline"));
    expect((await read(bundle.channelId)).status).toBe(502);
    expect((await read(bundle.channelId)).status).toBe(502);
    expect(collector.channel).toHaveBeenCalledTimes(1);
    expect((await read("recent")).status).toBe(200);
    advance();
    await read(bundle.channelId);
    expect(collector.channel).toHaveBeenCalledTimes(2);
  });

  it("evicts old responses rather than keeping an unbounded channel cache", async () => {
    const { read, collector } = setup();
    for (let i = 1; i <= 17; i++) await read(`0x${i.toString(16).padStart(64, "0")}`);
    await read(`0x${"1".padStart(64, "0")}`);
    expect(collector.channel).toHaveBeenCalledTimes(18);
  });

  it("returns a dated, validated recent list and preserves empty data", async () => {
    const { read, collector, advance } = setup();
    const reply = await read("recent");
    expect(recentInput(reply.body)).toEqual({
      channelIds: [bundle.channelId],
      capturedAt: bundle.capturedAt,
      source: "https://mcp.flop.network/mcp",
    });
    expect(collector.tape).toHaveBeenCalledExactlyOnceWith(6);
    const tape = await collector.tape();
    collector.tape.mockResolvedValue({ ...tape, rows: [] });
    advance();
    expect(recentInput((await read("recent")).body).channelIds).toEqual([]);
    collector.tape.mockResolvedValue({ ...tape, errors: ["partial capture"] });
    advance();
    expect((await read("recent")).status).toBe(502);
  });

  it("rejects hostile recent-list responses", () => {
    const valid = {
      channelIds: [bundle.channelId],
      capturedAt: bundle.capturedAt,
      source: "https://mcp.flop.network/mcp",
    };
    for (const invalid of [
      null,
      {},
      { ...valid, channelIds: ["javascript:alert(1)"] },
      { ...valid, channelIds: [bundle.channelId, bundle.channelId] },
      { ...valid, source: "https://example.invalid" },
      { ...valid, capturedAt: "yesterday" },
    ])
      expect(() => recentInput(invalid)).toThrow();
  });

  it("browser entry replays a real bundle offline and rejects tampered evidence", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const report = await verifyEvidence(bundle);
      expect(report.exitCode).toBe(3);
      expect(report.checks.find((c) => c.id === "escrow-conservation")?.status).toBe("PASS");
      const changed = structuredClone(bundle);
      changed.observations[0]!.raw += " ";
      expect(await verifyEvidence(changed)).toMatchObject({
        exitCode: 1,
        checks: [{ id: "bundle-integrity", status: "FAIL" }],
      });
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});
