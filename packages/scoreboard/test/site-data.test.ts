// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import first from "../fixtures/snapshot-01.json";
import second from "../fixtures/snapshot-02.json";
import { parseSnapshot } from "../src/schema";
import { pickMiner } from "../src/router";
import {
  addHistory,
  historyPoint,
  historyGeometry,
  parseResponse,
  snapshotStore,
  TTL_MS,
} from "../../../apps/web/app/scoreboard/data";

describe("scoreboard site evidence boundary", () => {
  it("coalesces readers, caches and returns independent snapshot copies", async () => {
    let calls = 0;
    let now = Date.parse(second.measuredAt);
    const read = snapshotStore(
      async () => {
        calls++;
        return parseSnapshot(second);
      },
      parseSnapshot(first),
      () => now,
    );
    const results = await Promise.all([read(), read(), read()]);
    expect(calls).toBe(1);
    expect(results[0]!.status).toBe("observed");
    results[0]!.snapshot.records.length = 0;
    expect((await read()).snapshot.records).toHaveLength(5);
    expect(calls).toBe(1);
    now += TTL_MS;
    await read();
    expect(calls).toBe(2);
  });

  it("preserves provenance on failure, backs off and recovers", async () => {
    let now = Date.parse(second.measuredAt);
    let calls = 0;
    const read = snapshotStore(
      async () => {
        calls++;
        if (calls < 3) throw new Error("offline");
        return parseSnapshot(second);
      },
      parseSnapshot(first),
      () => now,
    );
    const failed = await read();
    expect(failed.status).toBe("last-known");
    expect(failed.snapshot.measuredAt).toBe(first.measuredAt);
    expect(Date.parse(failed.retryAt) - now).toBe(120_000);
    now += TTL_MS;
    await read();
    expect(calls).toBe(1);
    now += TTL_MS;
    const again = await read();
    expect(Date.parse(again.retryAt) - now).toBe(240_000);
    now += 240_000;
    expect((await read()).status).toBe("observed");
    expect((await read()).snapshot.measuredAt).toBe(second.measuredAt);
  });

  it("successful empty responses replace earlier observations", async () => {
    const empty = parseSnapshot(second);
    const settlements = empty.records.find((record) => record.kind === "settlements")!;
    settlements.raw.data = [];
    settlements.raw.pagination = { total: 0, limit: 100, offset: 0, hasMore: false };
    const read = snapshotStore(async () => empty, parseSnapshot(first));
    const result = await read();
    expect(result.status).toBe("observed");
    expect(result.snapshot.records.find((record) => record.kind === "settlements")!.raw.data).toEqual([]);
  });

  it("rejects hostile browser data and never replaces a valid snapshot with malformed input", async () => {
    const read = snapshotStore(
      async () => ({ ...parseSnapshot(second), schemaVersion: 9 }) as never,
      parseSnapshot(first),
    );
    const result = await read();
    expect(result.status).toBe("last-known");
    expect(result.snapshot.measuredAt).toBe(first.measuredAt);
    expect(() => parseResponse({ ...result, status: "live-proof" })).toThrow();
    expect(() => parseResponse({ ...result, checkedAt: "yesterday" })).toThrow();
    expect(() => parseResponse({ ...result, snapshot: { ...result.snapshot, records: [] } })).toThrow();
    expect(parseResponse(result)).toEqual(result);
  });

  it("retains original settlement times and exact decimal history values without duplicating cached observations", () => {
    const snapshot = parseSnapshot(first);
    const point = historyPoint(snapshot);
    expect(point.measuredAt).toBe(snapshot.records.find((record) => record.kind === "settlements")!.measuredAt);
    expect(point.prices["5FkMpoVojgbmpex4ENpLimrQ29pMPQK8qJZRWDHpQxYELwZ1"]).toBe(
      "6480000000000000.768181818181818181",
    );
    const history = addHistory([point], snapshot);
    expect(history).toHaveLength(1);
    expect(addHistory(history, parseSnapshot(second))).toHaveLength(2);
  });

  it("a recorded fallback never routes using its old measurement time", async () => {
    const now = Date.parse(second.measuredAt) + 3600_000;
    const read = snapshotStore(
      async () => {
        throw new Error("offline");
      },
      parseSnapshot(first),
      () => now,
    );
    const response = await read();
    const result = pickMiner(response.snapshot, { model: "qwen/qwen2.5-0.5b-instruct", minConfidence: 0, now });
    expect(result.status).toBe("no-eligible-miner");
    expect(result.candidates.some((candidate) => candidate.reasons.includes("price-source-expired"))).toBe(true);
    expect(
      result.candidates.every(
        (candidate) =>
          candidate.reasons.includes("price-source-expired") || candidate.reasons.includes("model-not-listed"),
      ),
    ).toBe(true);
  });

  it("plots tiny differences in large raw decimal prices without floating-point collapse", () => {
    const points = historyGeometry(
      [
        {
          measuredAt: "2026-11-05T08:00:00Z",
          source: "recorded",
          prices: { miner: "6480000000000000.768181818181818181" },
        },
        { measuredAt: "2026-11-05T08:01:00Z", source: "recorded", prices: { miner: null } },
        {
          measuredAt: "2026-11-05T08:02:00Z",
          source: "recorded",
          prices: { miner: "6480000000000000.768181818181818182" },
        },
      ],
      "miner",
    );
    expect(points.map((point) => point.y)).toEqual([90, null, 20]);
    expect(points.map((point) => point.x)).toEqual([12, 240, 468]);
  });
});
