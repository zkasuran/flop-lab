// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import { createChainReader, parseHtlcs, parseHtlcCheck } from "../src/chain";
import { inspectTranscript } from "../src/inspect";
import { simulate } from "../src/simulate";
import rows from "../fixtures/htlcs.json";
import absent from "../fixtures/check-absent.json";
import observed from "../fixtures/check-observed.json";
it("validates recorded raw responses without claiming the checker found absence", () => {
  expect(parseHtlcs(JSON.parse(rows.raw))).toEqual(rows.value.htlcs);
  expect(parseHtlcCheck(absent.value)).toContain("does not distinguish");
  expect(parseHtlcCheck(observed.value)).toContain("does not distinguish");
  expect(() => parseHtlcs({ htlcs: [{ hashLock: "bad" }] })).toThrow();
  expect(() => parseHtlcs({ htlcs: null })).toThrow();
  expect(parseHtlcs({ htlcs: [] })).toEqual([]);
  expect(() => parseHtlcCheck({ status: "SETTLED" })).toThrow("unrecognized");
});
it("uses shared MCP, caches requests and reports a scoped hash match", async () => {
  const client = new McpClient({
    minIntervalMs: 0,
    retries: 0,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { id: number; params: { name: string } };
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: body.params.name === "flop_check_htlc" ? observed.raw : rows.raw }],
          },
        }),
      );
    },
  });
  let time = 0;
  const read = createChainReader(client, () => time);
  const state = inspectTranscript(simulate("happy")).state!;
  state.statement = rows.value.htlcs[0]!.hashLock;
  const first = await read(state);
  expect(first.status).toBe("observed");
  expect(first.rows[0]?.hashLock).toBe(state.statement);
  expect(first.requests).toBe(2);
  expect((await read(state)).cached).toBe(true);
  expect(client.stats.requests).toBe(2);
  time = 60_001;
  await read(state);
  expect(client.stats.requests).toBe(4);
});
it("handles offline failure and skips point locks without network", async () => {
  const client = new McpClient({
    retries: 0,
    minIntervalMs: 0,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  const read = createChainReader(client);
  expect((await read(inspectTranscript(simulate("point")).state)).status).toBe("not-applicable");
  expect(client.stats.requests).toBe(0);
  const result = await read(inspectTranscript(simulate("happy")).state);
  expect(result.status).toBe("unavailable");
  expect(result.evidence.every((e) => e.error?.includes("offline"))).toBe(true);
});
