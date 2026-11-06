// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import {
  HTLC_QUERY,
  parseHtlcs,
  parseHtlcCheck,
  parseSwapPage,
  recordedObservations,
  SwapReader,
} from "../src/observed";
import swaps from "../fixtures/swaps.json";
import htlcs from "../fixtures/htlcs.json";
import check from "../fixtures/check.json";

describe("observed evidence", () => {
  it("replays real raw responses and distinguishes orders from HTLCs", () => {
    const result = recordedObservations();
    expect(result.swaps.value).toEqual({ page: 1, total: 0, rows: [] });
    expect(result.htlcs.value?.length).toBe(JSON.parse(htlcs.raw).htlcs.length);
    expect(result.htlcs.value?.[0]?.timeout).toBe(2989028);
    expect(result.check.value?.status).toBe("UNKNOWN");
    expect(result.htlcs.measuredAt).toBe(htlcs.measuredAt);
    expect(htlcs.args.query).toBe(HTLC_QUERY);
  });
  it("handles empty, hostile and unrecognized shapes without invented totals", () => {
    expect(parseHtlcs({ htlcs: [] })).toEqual([]);
    for (const value of [null, [], {}, { htlcs: [], errors: [] }, { htlcs: [{ hashLock: "bad" }] }])
      expect(() => parseHtlcs(value)).toThrow();
    for (const value of [
      null,
      {},
      { page: 1, total: -1, swaps: [] },
      { page: 1, total: 0, swaps: [{}] },
      { page: 1, total: 1, swaps: [null] },
    ])
      expect(() => parseSwapPage(value)).toThrow();
    expect(parseSwapPage({ page: 1, total: 1, swaps: [{ arbitrary: "synthetic order" }] }).rows).toHaveLength(1);
    expect(parseHtlcCheck({ status: "SETTLED" }).status).toBe("UNKNOWN");
  });
  it("rejects malformed selected fields while preserving future status labels", () => {
    const row = JSON.parse(htlcs.raw).htlcs[0];
    for (const change of [
      { amount: "1.1" },
      { timeout: 0.2 },
      { sender: 5 },
      { recipient: undefined },
      { hashLock: "ab" },
    ])
      expect(() => parseHtlcs({ htlcs: [{ ...row, ...change }] })).toThrow();
    expect(parseHtlcs({ htlcs: [{ ...row, status: "FUTURE_STATUS" }] })[0]?.status).toBe("FUTURE_STATUS");
  });
  it("uses the shared client, caches for thirty seconds and sends only a normalized hash", async () => {
    let now = 0;
    const sent: { method: string; params: { name: string; arguments: Record<string, unknown> } }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      sent.push(body);
      const raw =
        body.params.name === "flop_list_swaps"
          ? swaps.raw
          : body.params.name === "flop_indexer_query"
            ? htlcs.raw
            : check.raw;
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: raw }] } }),
      );
    });
    const reader = new SwapReader(new McpClient({ fetch: fetcher, minIntervalMs: 0, retries: 0 }), () => now);
    await reader.observe();
    await reader.observe();
    expect(fetcher).toHaveBeenCalledTimes(2);
    now = 30_000;
    await reader.observe();
    expect(fetcher).toHaveBeenCalledTimes(4);
    await Promise.all([reader.check("0x" + "AA".repeat(32)), reader.check("aa".repeat(32))]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(sent.at(-1)?.params).toEqual({ name: "flop_check_htlc", arguments: { hash_lock: "aa".repeat(32) } });
    await expect(reader.check("bad")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("reports service and schema failures as missing data", async () => {
    const reader = new SwapReader(
      new McpClient({ fetch: async () => new Response("offline", { status: 503 }), retries: 0, minIntervalMs: 0 }),
    );
    const result = await reader.observe();
    expect(result.swaps.value).toBeNull();
    expect(result.htlcs.value).toBeNull();
    expect(result.swaps.error).toContain("503");
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")("optional bounded live public reads", async (context) => {
    const result = await new SwapReader().observe();
    if (result.swaps.error || result.htlcs.error) context.skip();
    expect(result.swaps.value?.total).toBeGreaterThanOrEqual(0);
  });
});
