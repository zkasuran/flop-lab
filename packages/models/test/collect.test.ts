// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import fixture from "./fixtures/devnet.json";
import { createCollector } from "../src/collect";
import { catalogue } from "../src/catalogue";
import { GATEWAY } from "../src/schema";

it("replays recorded responses through the one MCP client, coalesces requests and expires cache", async () => {
  let now = Date.parse(fixture.completedAt),
    calls = 0;
  const collect = createCollector({
    now: () => now,
    sleep: async () => {},
    fetch: async (url, init) => {
      calls++;
      if (url === GATEWAY) return new Response(fixture.observations.find((o) => o.key === "gateway")!.raw);
      const body = JSON.parse(String(init?.body)) as {
        id: number;
        params: { name: string; arguments: { model_id?: string } };
      };
      const keys: Record<string, string> = {
        flop_discover_models: "discover",
        flop_trust_root: "trust",
        flop_list_providers: "providers",
        flop_compare_pricing: "compare",
        flop_get_model_info: `info:${body.params.arguments.model_id}`,
        flop_get_model_pricing: `pricing:${body.params.arguments.model_id}`,
      };
      const raw = fixture.observations.find((o) => o.key === keys[body.params.name])!.raw;
      return new Response(
        `data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: raw }] } })}\n\n`,
      );
    },
  });
  const [first, second] = await Promise.all([collect(), collect()]);
  expect(first).toBe(second);
  expect(first.requests).toBe(11);
  expect(calls).toBe(11);
  expect(catalogue(first).models).toHaveLength(3);
  await collect();
  expect(calls).toBe(11);
  now += 30_000;
  await collect();
  expect(calls).toBe(22);
});

it("backs off once on 429 and records failed sources without an unbounded loop", async () => {
  const waits: number[] = [];
  let calls = 0;
  const collect = createCollector({
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: async () => {
      calls++;
      return new Response("busy", { status: 429, headers: { "retry-after": "1" } });
    },
  });
  const result = await collect();
  expect(calls).toBe(8);
  expect(result.observations.every((o) => o.raw === null)).toBe(true);
  expect(waits).toContain(1000);
  expect(catalogue(result).checks.every((c) => c.status === "UNKNOWN")).toBe(true);
});
