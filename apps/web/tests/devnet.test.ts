// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { McpClient, getStats, listSettlements } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import stats from "./fixtures/stats.json";
import settlements from "./fixtures/settlements.json";
import models from "./fixtures/models.json";
import {
  FetchFailure,
  observationCache,
  parseMiners,
  parseSettlements,
  parseStats,
  readPublic,
  TTL_MS,
} from "../lib/devnet";

function replay() {
  return new McpClient({
    fetch: replayFetch({ "call-flop_get_stats": stats.raw, "call-flop_list_settlements": settlements.raw }),
    retries: 0,
    minIntervalMs: 0,
  });
}

describe("recorded public boundaries", () => {
  it("reads recorded SSE through the shared client without interpreting operators as miners", async () => {
    expect(parseStats({ stats: (await getStats(replay())).value })).toEqual({ block: 2947024, accounts: 5956 });
  });
  it("orders the recorded settlement page by timestamp", async () => {
    const rows = parseSettlements({ data: (await listSettlements(replay())).value.data });
    expect(rows).toHaveLength(5);
    expect(rows[0]?.channel).toBe("0xa5d0a1722a5c7b8b86d7489ff1e76d0c3eb0a72e39e9c47edee1681ef766deec");
    expect(rows[0]?.at).toBe(1793866215001);
    expect(rows.every((row, i) => i === 0 || (rows[i - 1]?.at ?? 0) >= row.at)).toBe(true);
  });
  it("deduplicates the recorded price sources across models", () => {
    const raw = JSON.parse(models.raw) as { data: unknown[] };
    const miners = parseMiners(raw);
    expect(miners.length).toBeGreaterThan(0);
    expect(parseMiners({ data: [...raw.data, ...raw.data] })).toEqual(miners);
  });
  it("handles empty lists without invented observations", () => {
    expect(parseMiners({ data: [] })).toEqual([]);
    expect(parseSettlements({ data: [] })).toEqual([]);
  });
  it.each([
    null,
    {},
    [],
    { stats: { latestBlockNumber: -1, totalAccounts: 1 } },
    { stats: { latestBlockNumber: 2 ** 60, totalAccounts: 1 } },
    { stats: { latestBlockNumber: "42", totalAccounts: 1 } },
  ])("rejects hostile stats %j", (value) => {
    expect(() => parseStats(value)).toThrow();
  });
  it("rejects hostile display fields", () => {
    expect(() => parseMiners({ data: [{ "x-flop": { price_sources: [{ miner_address: "<script>" }] } }] })).toThrow();
    expect(() => parseSettlements({ data: [{}] })).toThrow();
  });
});

describe("observation cache", () => {
  it("coalesces requests, retains the original timestamp on failure and backs off", async () => {
    let now = Date.parse("2026-11-05T09:00:00Z");
    const load = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(7)
      .mockRejectedValueOnce(new FetchFailure("HTTP 429", now + 120000))
      .mockResolvedValueOnce(9);
    const read = observationCache(load, "fixture transport", undefined, () => now);
    const values = await Promise.all([read(), read(), read()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(values.every((value) => value.value === 7 && !value.stale)).toBe(true);
    now += TTL_MS;
    const failed = await read();
    expect(failed.value).toBe(7);
    expect(failed.measuredAt).toBe(values[0]?.measuredAt);
    expect(failed.stale).toBe(true);
    now += TTL_MS;
    await read();
    expect(load).toHaveBeenCalledTimes(2);
    now += 60000;
    expect((await read()).value).toBe(9);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("uses dated recorded data after a cold offline start and has a genuine no-data state", async () => {
    const fail = async () => {
      throw new Error("offline");
    };
    const seed = { value: 4, measuredAt: stats.measuredAt };
    expect(await observationCache(fail, stats.source, seed)()).toMatchObject({
      ...seed,
      stale: true,
      error: "offline",
    });
    expect(await observationCache(fail, stats.source)()).toMatchObject({ value: null, measuredAt: null, stale: true });
  });
  it("replaces old values with a measured empty list after a devnet reset", async () => {
    const read = observationCache(async () => [], "fixture", { value: [1], measuredAt: stats.measuredAt });
    expect((await read()).value).toEqual([]);
  });
  it("does not cache malformed boundary data as a new good value", async () => {
    const read = observationCache(async () => parseStats({}), stats.source, {
      value: { block: 1, accounts: 2 },
      measuredAt: stats.measuredAt,
    });
    expect(await read()).toMatchObject({ value: { block: 1, accounts: 2 }, measuredAt: stats.measuredAt, stale: true });
  });
});

describe("bounded public transport", () => {
  it("honours Retry-After without retrying within a request", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    try {
      await expect(readPublic("https://api.flop.network/v1/models")).rejects.toMatchObject({ message: "HTTP 429" });
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      mock.mockRestore();
    }
  });
  it("rejects an oversized streamed body", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(200001)));
    try {
      await expect(readPublic("https://api.flop.network/v1/models")).rejects.toThrow("size limit");
    } finally {
      mock.mockRestore();
    }
  });
  it.skipIf(!process.env.FLOP_LIVE_TEST)("optionally checks one fresh live response", async ({ skip }) => {
    let raw: string;
    try {
      raw = await readPublic("https://api.flop.network/v1/models");
    } catch {
      skip();
      return;
    }
    expect(parseMiners(JSON.parse(raw))).toBeInstanceOf(Array);
  });
});
