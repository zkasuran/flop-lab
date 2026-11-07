// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { readFixture } from "@flop-lab/fixtures";
import { McpClient, McpError } from "../src/client";
import { fixtureSse, replayFetch } from "../src/fixtures";

const ok = (id: number, text: string) =>
  `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } })}\n\n`;

function scripted(responses: (Response | Error | "hang")[]) {
  let i = 0;
  const calls: number[] = [];
  const fetchFn = (async (_u: unknown, init?: RequestInit) => {
    calls.push(Date.now());
    const r = responses[Math.min(i++, responses.length - 1)]!;
    if (r === "hang") {
      return new Promise<Response>((_res, rej) =>
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))),
      );
    }
    if (r instanceof Error) throw r;
    return r.clone();
  }) as typeof fetch;
  return { fetchFn, calls: () => calls.length };
}

const fast = { sleep: async () => {}, minIntervalMs: 0, baseDelayMs: 1 };

describe("McpClient", () => {
  it("initializes through the same transport without extra tool calls", async () => {
    const requests: unknown[] = [];
    const recording = readFixture("status-2026-11-06T05-23-46.400Z-mcp");
    const result = {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "flop-network", version: "0.2.0" },
      capabilities: { tools: { listChanged: true }, resources: { listChanged: true }, completions: {} },
    };
    const fetchFn: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(recording.body, {
        status: recording.httpStatus,
        headers: { "Content-Type": recording.contentType },
      });
    };
    const client = new McpClient({ fetch: fetchFn, retries: 0, ...fast });
    const answer = await client.initialize();
    expect(answer.value).toEqual(result);
    expect(JSON.parse(answer.raw)).toEqual(result);
    expect(answer.attempts).toBe(1);
    expect(requests).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "flop-lab", version: "0.1.0" } },
      },
    ]);
    expect(client.stats.requests).toBe(1);
  });

  it("preserves initialize RPC errors", async () => {
    const s = scripted([new Response('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"unsupported"}}')]);
    await expect(new McpClient({ fetch: s.fetchFn, retries: 0, ...fast }).initialize()).rejects.toMatchObject({
      kind: "rpc",
      details: { code: -32601 },
    });
    expect(s.calls()).toBe(1);
  });
  it("parses a JSON tool answer and reports metadata", async () => {
    const s = scripted([new Response(ok(1, '{"x":1}'))]);
    const r = await new McpClient({ fetch: s.fetchFn, ...fast }).callTool<{ x: number }>("t");
    expect(r.value).toEqual({ x: 1 });
    expect(r.raw).toBe('{"x":1}');
    expect(r.attempts).toBe(1);
    expect(new Date(r.measuredAt).toString()).not.toBe("Invalid Date");
  });

  it("returns plain text when the tool answer is not JSON", async () => {
    const s = scripted([new Response(ok(1, "hello"))]);
    expect((await new McpClient({ fetch: s.fetchFn, ...fast }).callTool("t")).value).toBe("hello");
  });

  it("retries 503 then succeeds, and counts it", async () => {
    const s = scripted([new Response("down", { status: 503 }), new Response(ok(1, "1"))]);
    const c = new McpClient({ fetch: s.fetchFn, ...fast });
    const r = await c.callTool("t");
    expect(r.attempts).toBe(2);
    expect(c.stats).toEqual({ requests: 2, retries: 1, failures: 0 });
  });

  it("does not retry 403", async () => {
    const s = scripted([new Response("blocked", { status: 403 })]);
    const c = new McpClient({ fetch: s.fetchFn, ...fast });
    await expect(c.callTool("t")).rejects.toMatchObject({ kind: "http", details: { status: 403 } });
    expect(s.calls()).toBe(1);
    expect(c.stats.failures).toBe(1);
  });

  it("gives up after the configured retries", async () => {
    const s = scripted([new Response("x", { status: 500 })]);
    const c = new McpClient({ fetch: s.fetchFn, retries: 2, ...fast });
    await expect(c.callTool("t")).rejects.toBeInstanceOf(McpError);
    expect(s.calls()).toBe(3);
  });

  it("waits at least Retry-After on 429", async () => {
    const sleeps: number[] = [];
    const s = scripted([
      new Response("slow", { status: 429, headers: { "Retry-After": "2" } }),
      new Response(ok(1, "1")),
    ]);
    await new McpClient({
      fetch: s.fetchFn,
      sleep: async (ms) => void sleeps.push(ms),
      minIntervalMs: 0,
      baseDelayMs: 1,
    }).callTool("t");
    expect(Math.max(...sleeps)).toBeGreaterThanOrEqual(2000);
  });

  it("retries a network error", async () => {
    const s = scripted([new Error("ECONNRESET"), new Response(ok(1, "1"))]);
    expect((await new McpClient({ fetch: s.fetchFn, ...fast }).callTool("t")).attempts).toBe(2);
  });

  it("times out a hanging request and reports the kind", async () => {
    const s = scripted(["hang"]);
    const c = new McpClient({ fetch: s.fetchFn, timeoutMs: 20, retries: 0, ...fast });
    await expect(c.callTool("t")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps isError tool results and JSON-RPC errors to distinct kinds", async () => {
    const tool = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "bad input" }], isError: true },
    });
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Tool x not found" } });
    const c1 = new McpClient({ fetch: scripted([new Response(`data: ${tool}\n\n`)]).fetchFn, ...fast });
    await expect(c1.callTool("t")).rejects.toMatchObject({ kind: "tool", message: "bad input" });
    const c2 = new McpClient({ fetch: scripted([new Response(`data: ${rpc}\n\n`)]).fetchFn, ...fast });
    await expect(c2.callTool("t")).rejects.toMatchObject({ kind: "rpc", details: { code: -32602 } });
  });

  it("rejects a body with no JSON-RPC answer", async () => {
    const c = new McpClient({ fetch: scripted([new Response("<html>nope</html>")]).fetchFn, ...fast });
    await expect(c.callTool("t")).rejects.toMatchObject({ kind: "protocol" });
  });

  it("spaces requests by minIntervalMs", async () => {
    let t = 1000;
    const sleeps: number[] = [];
    const s = scripted([new Response(ok(1, "1")), new Response(ok(2, "1"))]);
    const c = new McpClient({
      fetch: s.fetchFn,
      minIntervalMs: 250,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await c.callTool("t");
    await c.callTool("t");
    expect(sleeps).toEqual([250]);
  });

  it("serializes concurrent calls", async () => {
    let inflight = 0;
    let max = 0;
    const f = (async (_u: unknown, init?: RequestInit) => {
      const id = (JSON.parse(String(init?.body)) as { id: number }).id;
      inflight++;
      max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return new Response(ok(id, "1"));
    }) as typeof fetch;
    const c = new McpClient({ fetch: f, ...fast });
    await Promise.all([c.callTool("a"), c.callTool("b"), c.callTool("c")]);
    expect(max).toBe(1);
  });

  it("sends the headers the hosted server needs", async () => {
    let seen: Headers | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response(ok(1, "1"));
    }) as typeof fetch;
    await new McpClient({ fetch: f, ...fast }).callTool("t");
    expect(seen?.get("accept")).toBe("application/json, text/event-stream");
    expect(seen?.get("user-agent")).toContain("flop-lab");
  });
});

describe("against the recorded server answers", () => {
  const client = () => new McpClient({ fetch: replayFetch(), ...fast });
  it("lists the 34 tools", async () => {
    const tools = (await client().listTools()).value;
    expect(tools.length).toBe(34);
    expect(tools.some((t) => t.name === "flop_list_settlements")).toBe(true);
  });
  it("answers an unknown tool like the server does", async () => {
    await expect(client().callTool("flop_nope")).rejects.toMatchObject({ kind: "rpc", details: { code: -32602 } });
  });
  it("reports invalid arguments as a tool error", async () => {
    const c = new McpClient({ fetch: replayFetch({ "call-flop_get_balance": fixtureSse("call-bad-args") }), ...fast });
    await expect(c.callTool("flop_get_balance")).rejects.toMatchObject({ kind: "tool" });
  });
});
