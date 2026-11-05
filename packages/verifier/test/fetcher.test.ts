// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { McpClient } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import { expect, it, vi } from "vitest";
import { canonical, EvidenceFetcher, parseEvidence, verifyEvidence } from "../src/index";
import { object } from "../src/schema";

const bundle = parseEvidence(JSON.parse(readFileSync(new URL("../fixtures/channel-1.json", import.meta.url), "utf8")));

function recorded() {
  return vi.fn<typeof fetch>(async (url, init) => {
    const request = object(JSON.parse(String(init?.body)), "request");
    const params = object(request.params, "params");
    const obs = bundle.observations.find(
      (o) => o.tool === params.name && canonical(o.args) === canonical(params.arguments),
    );
    if (!obs) throw new Error(`Unexpected fixture request ${canonical(params)}`);
    return replayFetch({
      [`call-${obs.tool}`]: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: obs.raw }] },
      }),
    })(url, init);
  });
}

it("uses the shared replay client, preserves raw text and caches without changing measurement time", async () => {
  const fetch = recorded();
  let now = Date.parse(bundle.capturedAt) + 1000;
  const client = new McpClient({ fetch, retries: 0, minIntervalMs: 0, now: () => now });
  const fetcher = new EvidenceFetcher({ client, ttlMs: 30_000, now: () => now });
  const first = await fetcher.channel(bundle.channelId);
  expect((await verifyEvidence(first)).exitCode).toBe(3);
  expect(first.observations.map((o) => o.raw)).toEqual(bundle.observations.map((o) => o.raw));
  const count = fetch.mock.calls.length;
  now += 29_000;
  const cached = await fetcher.channel(bundle.channelId);
  expect(fetch.mock.calls).toHaveLength(count);
  expect(cached.observations[0]?.measuredAt).toBe(first.observations[0]?.measuredAt);
  cached.observations[0]!.raw = "changed by caller";
  expect((await fetcher.channel(bundle.channelId)).observations[0]?.raw).toBe(first.observations[0]?.raw);
  now += 1001;
  await fetcher.channel(bundle.channelId);
  expect(fetch.mock.calls).toHaveLength(count * 2);
});

it("returns dated missing observations on a transport outage without unbounded retries", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("offline", { status: 503 }));
  const sleep = vi.fn(async () => undefined);
  const client = new McpClient({ fetch, retries: 1, sleep, minIntervalMs: 0 });
  const fetcher = new EvidenceFetcher({ client });
  const report = await fetcher.tape(10);
  expect(report.exitCode).toBe(3);
  expect(report.rows).toEqual([]);
  expect(report.errors[0]).toContain("503");
  expect(report.observations[0]?.attempts).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("handles an empty tape and rejects malformed pagination", async () => {
  const response = (pagination: unknown) =>
    replayFetch({
      "call-flop_list_settlements": JSON.stringify({
        result: { content: [{ type: "text", text: JSON.stringify({ data: [], pagination }) }] },
      }),
    });
  const good = new EvidenceFetcher({
    client: new McpClient({ fetch: response({ total: 0, limit: 10, offset: 0, hasMore: false }), minIntervalMs: 0 }),
  });
  expect((await good.tape(10)).exitCode).toBe(3);
  const bad = new EvidenceFetcher({
    client: new McpClient({ fetch: response({ total: 0, limit: 10, offset: 0, hasMore: true }), minIntervalMs: 0 }),
  });
  expect((await bad.tape(10)).errors).toContain("Empty page claims more rows");
});

it.each([0, -1, 1.5, 1001, Number.NaN])("rejects invalid tape limit %s before network", async (limit) => {
  const fetch = recorded();
  const fetcher = new EvidenceFetcher({ client: new McpClient({ fetch }) });
  await expect(fetcher.tape(limit)).rejects.toThrow("limit");
  expect(fetch).not.toHaveBeenCalled();
});
