// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAuditor, parseSnapshot } from "../src/index";
const fixture = parseSnapshot(JSON.parse(readFileSync(new URL("../fixtures/devnet.json", import.meta.url), "utf8")));
function replay() {
  const requests: { url: string; method: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        id: number;
        params: { name: string; arguments: Record<string, unknown> };
      };
      const { name, arguments: args } = body.params;
      const found = fixture.observations.find(
        (o) =>
          o.request.tool === name &&
          (name === "flop_indexer_query"
            ? o.request.query === args.query
            : name === "flop_get_compute_channel"
              ? o.request.channel_id === args.channel_id
              : true),
      );
      if (!found) throw new Error(`Unrecorded call ${name}`);
      return new Response(
        `data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: found.raw }] } })}\n\n`,
      );
    }
    const found = fixture.observations.find((o) => o.source === url);
    if (!found) throw new Error(`Unrecorded URL ${url}`);
    return new Response(found.raw);
  };
  return { requests, fetcher };
}
describe("bounded collector", () => {
  it("uses the shared MCP transport, caches by limit and preserves raw evidence", async () => {
    const { requests, fetcher } = replay();
    let now = Date.parse(fixture.startedAt);
    const auditor = createAuditor({
      fetch: fetcher,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    const report = await auditor.run({ limit: 3 });
    expect(requests).toHaveLength(10);
    expect(report.snapshot.requestBudget).toBe(20);
    expect(report.counts.FAIL).toBe(1);
    expect((await auditor.run({ limit: 3 })).cached).toBe(true);
    expect(requests).toHaveLength(10);
    report.snapshot.observations.length = 0;
    expect((await auditor.run({ limit: 3 })).snapshot.observations.length).toBe(10);
    now += 30001;
    await auditor.run({ limit: 3 });
    expect(requests).toHaveLength(20);
    expect(requests.filter((r) => r.url.includes("explorer.")).every((r) => r.method === "GET")).toBe(true);
  });
  it("backs off once for 429 and 5xx without exceeding the budget", async () => {
    const waits: number[] = [];
    let requests = 0;
    const auditor = createAuditor({
      fetch: async () => {
        requests++;
        return new Response("busy", { status: requests % 2 ? 429 : 503, headers: { "retry-after": "1" } });
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const report = await auditor.run({ limit: 3 });
    expect(requests).toBe(12);
    expect(requests).toBeLessThanOrEqual(report.snapshot.requestBudget);
    expect(report.counts.PASS).toBe(0);
    expect(waits.some((ms) => ms >= 1000)).toBe(true);
    await auditor.run({ limit: 3 });
    expect(requests).toBe(24); // Failure snapshots are not cached.
  });
  it("does not retry permanent errors or make lookups from malformed roots", async () => {
    let requests = 0;
    const report = await createAuditor({
      fetch: async () => {
        requests++;
        return new Response("denied", { status: 403 });
      },
      sleep: async () => {},
    }).run({ limit: 1 });
    expect(requests).toBe(6);
    expect(report.counts.PASS).toBe(0);
  });
  it("rejects invalid limits before sending a request", async () => {
    let calls = 0;
    const a = createAuditor({
      fetch: async () => {
        calls++;
        return new Response();
      },
    });
    for (const limit of [0, -1, 101, 1.5, NaN, Infinity]) await expect(a.run({ limit })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("rejects oversized response bodies", async () => {
    const report = await createAuditor({
      fetch: async () => new Response("x".repeat(200001)),
      sleep: async () => {},
    }).run({ limit: 1 });
    expect(report.counts.PASS).toBe(0);
    expect(report.snapshot.observations.every((o) => o.error?.includes("200000"))).toBe(true);
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")("performs an opt-in live read or cleanly skips offline", async (context) => {
    const report = await createAuditor().run({ limit: 1 });
    if (report.snapshot.observations.every((o) => o.error)) return context.skip();
    expect(report.snapshot.requests).toBeLessThanOrEqual(report.snapshot.requestBudget);
  });
});
