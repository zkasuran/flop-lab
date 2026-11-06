// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Budget, ConsoleService, boundedFetch, parseRequest } from "../src/service";
import { checkSchema, fieldValue, parseTools } from "../src/schema";
import { curlCommand, estimateCalls, gatewayPrice, sourceState, tokenCost, validateInput } from "../src/core";
import { completions, inspectQuery } from "../src/query";
import { recordedConsole } from "../src/recorded";

const recording = recordedConsole();
const tool = (name: string) => {
  const tool = recording.catalog.tools.find((tool) => tool.name === name);
  if (!tool) throw new Error("Missing fixture tool");
  return tool;
};
const fixture = (name: string): { raw: string } =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as { raw: string };
const replay = () => {
  const names = [
    "flop_get_stats",
    "flop_indexer_query",
    "flop_estimate_cost",
    "flop_estimate_inference_cost",
    "flop_get_model_pricing",
    "flop_compare_pricing",
  ];
  const mcp = replayFetch(
    Object.fromEntries([
      ["tools-list", fixture("tools").raw],
      ...names.map((name) => [`call-${name}`, fixture(name).raw]),
    ]),
  );
  const transport: typeof fetch = (url, init) =>
    String(url).includes("api.flop.network") ? Promise.resolve(new Response(fixture("models").raw)) : mcp(url, init);
  return transport;
};

describe("recorded boundaries", () => {
  it("reads real discovery, stats and introspection without inventing timings", () => {
    expect(recording.catalog.tools).toHaveLength(34);
    expect(recording.catalog.tools.filter((tool) => tool.allowed)).toHaveLength(32);
    expect(recording.stats.durationMs).toBeNull();
    expect(recording.stats.check.status).toBe("unchecked");
    expect(recording.fields.some((field) => field.type === "Query" && field.field === "computeChannel")).toBe(true);
    expect(recording.fields.some((field) => field.type === "Stats" && field.field === "totalBlocks")).toBe(true);
    expect(recording.fields.find((field) => field.type === "Query" && field.field === "blocks")?.returns).toBe("Block");
  });
  it("rejects malformed and duplicate discovery; handles an empty list", () => {
    expect(parseTools([])).toEqual([]);
    expect(() => parseTools([null])).toThrow();
    expect(() => parseTools([{ name: "flop_health", inputSchema: {} }])).toThrow();
    expect(() => parseTools([tool("flop_get_stats"), tool("flop_get_stats")])).toThrow();
    expect(() => completions({})).toThrow();
    expect(completions({ __schema: { types: [] } })).toEqual([]);
  });
  it("fails closed for invalid schema and distinguishes no schema", () => {
    expect(checkSchema(undefined, {}).status).toBe("unchecked");
    expect(checkSchema({ $ref: "https://invalid.example/schema" }, {}).status).toBe("fail");
    expect(checkSchema({ type: "integer" }, "2").status).toBe("fail");
    expect(checkSchema({ type: "string", format: "date-time" }, "tomorrow").status).toBe("fail");
  });
  it("validates schemas, bounds and unknown arguments without coercing strings", () => {
    expect(() => validateInput(tool("flop_get_stats"), {})).not.toThrow();
    expect(() => validateInput(tool("flop_get_stats"), { unexpected: 1 })).toThrow("Unknown argument");
    expect(() => validateInput(tool("flop_list_swaps"), { limit: -1 })).toThrow();
    expect(() => validateInput(tool("flop_list_swaps"), { limit: 101 })).toThrow();
    expect(() => validateInput(tool("flop_estimate_cost"), {})).toThrow();
    expect(() => validateInput({ ...tool("flop_get_stats"), allowed: false }, {})).toThrow("allowlist");
    expect(fieldValue({ type: "string" }, "00123")).toBe("00123");
    expect(fieldValue({ type: "array" }, '["a"]')).toEqual(["a"]);
    expect(fieldValue({ type: "boolean" }, "false")).toBe(false);
  });
});

describe("query policy", () => {
  it("accepts real introspection and query strings containing braces", () => {
    expect(inspectQuery(String(recording.indexer.args.query)).depth).toBeLessThanOrEqual(8);
    expect(inspectQuery('query { block(hash: "{mutation}") { number } }').depth).toBe(2);
    expect(inspectQuery("query($n:Int=20) { blocks(limit:$n) { number } }", {}).fields).toBe(2);
  });
  it.each([
    "mutation { write }",
    "subscription { stats { tps } }",
    "{x} query Other {x}",
    "{ a { b { c { d { e { f { g { h { i } } } } } } } } }",
    "{ ...A } fragment A on Query { ...B } fragment B on Query { ...A }",
    "{ ...Unknown }",
    "{ stats { tps } } fragment Unused on Query { ...Unused }",
    "{ blocks(limit: 101) { number } }",
    "query($n:Int) {blocks(limit:$n){number}}",
    "{ blocks(limit: -1) { number } }",
    "{ blocks(offset: 10001) { number } }",
    `{ ${Array.from({ length: 7 }, (_, index) => `x${index}: stats { tps }`).join(" ")} }`,
    `{ stats { ${Array.from({ length: 100 }, (_, index) => `x${index}: tps`).join(" ")} }`,
    "#" + "x".repeat(8192),
  ])("rejects hostile query %s", (query) => {
    expect(() => inspectQuery(query)).toThrow();
  });
  it("counts repeated fragment fields and resolves pagination variables", () => {
    expect(inspectQuery("{ stats { ...A ...A } } fragment A on Stats { tps }").fields).toBe(3);
    expect(() => inspectQuery("query($n:Int){blocks(limit:$n){number}}", { n: 1000 })).toThrow();
    expect(() => validateInput(tool("flop_indexer_query"), { query: "mutation { write }" })).toThrow();
  });
});

describe("cost and reproduction", () => {
  it("uses matching totals in each tool and exact decimal arithmetic", () => {
    const calls = estimateCalls(recording.estimate.input);
    expect(calls[0]?.args).toMatchObject({ prompt_length: 1000, output_length: 500 });
    expect(calls[2]?.args.tokens_estimate).toBe(1500);
    expect(calls[3]?.args.tokens_estimate).toBe(1500);
    expect(tokenCost("0.006", "0.006", 1000, 500)).toBe("9");
    expect(tokenCost("0.1", "0.2", 1, 1)).toBe("0.3");
    expect(tokenCost("0", "0", 0, 0)).toBe("0");
    expect(tokenCost("0.000000000000000001", "0", 1, 0)).toBe("0.000000000000000001");
    expect(() => tokenCost("NaN", "0", 1, 1)).toThrow();
    expect(() => estimateCalls({ model: "x", tokens: -1, outputTokens: 500 })).toThrow();
  });
  it("keeps nominal labels and checks the expiry boundary", () => {
    const price = recording.estimate.gateway;
    expect(price?.sources).toHaveLength(22);
    const first = price?.sources[0];
    if (!first) throw new Error("Missing recorded sources");
    expect(first.source).toBe("devnet-nominal");
    expect(sourceState(first, Date.parse(first.expiresAt) - 1)).toBe("current");
    expect(sourceState(first, Date.parse(first.expiresAt))).toBe("expired");
    expect(sourceState(first, Date.parse(first.effectiveAt) - 1)).toBe("not effective");
    expect(gatewayPrice({ data: [] }, "missing", "2026-11-05T00:00:00Z")).toBeNull();
    expect(() => gatewayPrice({}, "missing", "2026-11-05T00:00:00Z")).toThrow();
  });
  it("shell-quotes apostrophes and shell metacharacters without executing them", () => {
    const args = { query: "'$(exit 9)\n`exit 8`" };
    const curl = curlCommand("flop_knowledge_search", args);
    // Replace only the executable with a shell function that emits arguments as NUL-separated text.
    const output = execFileSync("bash", ["-c", `curl() { printf '%s\\0' "$@"; }; ${curl}`])
      .toString()
      .split("\0");
    const body = output[output.indexOf("--data-raw") + 1];
    expect(JSON.parse(body ?? "{}").params.arguments).toEqual(args);
  });
});

describe("proxy service", () => {
  it("replays live fixtures, caches with original time and refreshes after TTL", async () => {
    let now = 0;
    const service = new ConsoleService(replay(), () => now);
    const request = { action: "call", tool: "flop_get_stats", args: {} };
    const first = await service.handle(request, "a");
    expect(first.requests).toBe(2);
    expect(first.payload.kind).toBe("call");
    now = 59_999;
    const hit = await service.handle(request, "a");
    expect(hit.cached).toBe(true);
    expect(hit.requests).toBe(0);
    expect(hit.payload).toEqual(first.payload);
    now = 60_000;
    expect((await service.handle(request, "a")).requests).toBe(1);
  });
  it("returns side-by-side estimates without treating HTTP success as proof", async () => {
    const service = new ConsoleService(replay());
    const response = await service.handle({ action: "estimate", input: recording.estimate.input }, "a");
    expect(response.requests).toBe(6);
    if (response.payload.kind !== "estimate") throw new Error("Wrong result");
    expect(response.payload.estimate.observations).toHaveLength(4);
    expect(response.payload.estimate.gateway?.prompt).toBe("0.006");
  });
  it("blocks denied tools and mutation queries before a tools/call request", async () => {
    let calls = 0;
    const transport = replay();
    const service = new ConsoleService((url, init) => {
      if (String(init?.body).includes('"tools/call"')) calls++;
      return transport(url, init);
    });
    await expect(service.handle({ action: "call", tool: "flop_agent_pack_install", args: {} }, "a")).rejects.toThrow(
      "allowlist",
    );
    await expect(
      service.handle({ action: "call", tool: "flop_indexer_query", args: { query: "mutation {write}" } }, "a"),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(() => parseRequest({ action: "estimate", input: null })).toThrow();
  });
  it("enforces visitor isolation, inclusive budget boundary and window reset", () => {
    const budget = new Budget();
    expect(budget.take("a", 20, 0)).toBe(0);
    expect(() => budget.take("a", 1, 59_999)).toThrow("budget");
    expect(budget.take("b", 1, 0)).toBe(19);
    expect(budget.take("a", 1, 60_000)).toBe(19);
  });
  it("caps response bodies and aborts stalled bodies", async () => {
    await expect(
      boundedFetch(async () => new Response("x".repeat(200_001)), new AbortController().signal)("https://example.test"),
    ).rejects.toThrow("byte limit");
    const controller = new AbortController();
    const request = boundedFetch(
      async () =>
        new Response(
          new ReadableStream({
            start() {
              /* Deliberately never emits. */
            },
          }),
        ),
      controller.signal,
    )("https://example.test");
    setTimeout(() => controller.abort(), 10);
    await expect(request).rejects.toThrow();
  });
  it("live smoke is opt-in and skips cleanly offline", async (context) => {
    if (process.env.CONSOLE_LIVE !== "1") return context.skip();
    try {
      expect((await new ConsoleService().handle({ action: "tools" }, "test")).payload.kind).toBe("tools");
    } catch (error) {
      if (/network|timeout|fetch|HTTP|request failed/i.test(String(error))) return context.skip();
      throw error;
    }
  });
});
