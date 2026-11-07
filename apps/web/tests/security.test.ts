// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { McpClient, getStats } from "@flop-lab/mcp";
import { replayFetch } from "@flop-lab/mcp/fixtures";
import stats from "./fixtures/stats.json";
import { parseStats } from "../lib/devnet";
import { LIMITS, contentSecurityPolicy, routePolicy, sameOrigin } from "../lib/security/policy";
import { createAdmission, RequestBudget, visitorKey } from "../lib/security/admission";
import { allowedSource, createPublicFetch, readBytes, safeJson, withPublicOperation } from "../lib/security/transport";
import { proxy } from "../proxy";
import { createTrailReader } from "../lib/security/trail-reader";
import { POST } from "../app/console/api/route";
import { POST as replayWatch } from "../app/watch/replay/route";
import { example, rulesYaml } from "../../../packages/watch/src/config";
import { createSearchService } from "../app/explorer/service";
import { inspectQuery } from "../../../packages/console/src/query";
import { validateInput } from "../../../packages/console/src/core";
import { recordedConsole } from "../../../packages/console/src/recorded";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const url = "https://flop-lab.example/console/api";
const json = (body: string, headers: HeadersInit = {}) =>
  new Request(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("route entry and cache boundaries", () => {
  it("admits only exact read paths for the documentation, API and MCP list routes", () => {
    for (const path of ["/docs/verifier/readme", "/api/v1/status", "/api/v1/openapi.json", "/mcp/tool-list"])
      expect(routePolicy(path), path).toEqual({ methods: ["GET", "HEAD"], query: [] });
    for (const path of [
      "/docs/verifier/readme/extra",
      "/docs/readme",
      "/api/v1",
      "/api/v1/status/extra",
      "/api/v2/status",
    ])
      expect(routePolicy(path), path).toBeUndefined();
  });
  it("requires a policy for every application data route", async () => {
    const entries = await readdir(new URL("../app/", import.meta.url), { recursive: true });
    const routes = entries.filter((entry) => entry.endsWith("/route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const path = `/${route.replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "example")}`;
      expect(routePolicy(path), path).toBeDefined();
    }
  });
  it.each([
    ["/verify/data?channel=a&channel=b", 400],
    ["/explorer/query?q=1&recorded=block", 400],
    ["/finality/live?host=http://127.0.0.1", 400],
    ["/knowledge/data?concept=" + "a".repeat(257), 400],
    ["/did/data?did=" + "a".repeat(2100), 414],
    ["/%63onsole/api?ignored=1", 405],
  ])("rejects ambiguous or unbounded URL %s", (path, status) => {
    expect(createAdmission()(new Request(`https://flop-lab.example${path}`))?.status).toBe(status);
  });
  it("does not admit cross-origin POSTs, opaque origins or MIME suffix tricks", () => {
    for (const origin of [
      "https://attacker.example",
      "null",
      "http://flop-lab.example",
      "https://flop-lab.example/path",
    ])
      expect(createAdmission()(json("{}", { origin }))?.status).toBe(403);
    expect(createAdmission()(json("{}", { "content-type": "application/json-malicious" }))?.status).toBe(415);
    expect(createAdmission()(json("{}", { "content-length": "32769" }))?.status).toBe(413);
    expect(createAdmission()(new Request(url, { headers: { "x-middleware-subrequest": "proxy" } }))?.status).toBe(400);
    expect(createAdmission()(json("{}", { origin: "https://flop-lab.example" }))).toBeNull();
  });
  it("rejects cross-site replay and unexpected mutation methods", () => {
    const replay = "https://flop-lab.example/invariants/replay";
    expect(
      createAdmission()(new Request(replay, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))?.status,
    ).toBe(403);
    expect(
      createAdmission()(new Request(replay, { method: "POST", body: "x", headers: { "content-length": "1" } }))?.status,
    ).toBe(413);
    expect(createAdmission()(new Request("https://flop-lab.example/", { method: "POST" }))?.status).toBe(405);
  });
  it("uses a configured canonical origin rather than a forged Host", () => {
    vi.stubEnv("SITE_URL", "https://public.example");
    expect(sameOrigin(json("{}", { host: "attacker.example", origin: "https://attacker.example" }))).toBe(false);
    expect(sameOrigin(json("{}", { origin: "https://public.example" }))).toBe(true);
  });
  it("ignores spoofed address headers and cookie rotation on ordinary hosts", () => {
    vi.stubEnv("VERCEL", "");
    const admit = createAdmission();
    for (let i = 0; i < LIMITS.apiPerVisitor; i++) {
      expect(
        admit(
          json("{}", {
            "x-forwarded-for": `192.0.2.${i}`,
            "x-vercel-forwarded-for": `192.0.2.${i}`,
            cookie: `flop_explorer=${i}`,
          }),
        ),
      ).toBeNull();
    }
    const blocked = admit(json("{}"));
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("cache-control")).toContain("no-store");
    expect(blocked?.headers.get("retry-after")).toBe("60");
  });
  it("separates trusted IPs but caps their aggregate", () => {
    vi.stubEnv("VERCEL", "1");
    const admit = createAdmission();
    for (let i = 0; i < LIMITS.apiGlobal; i++)
      expect(admit(json("{}", { "x-vercel-forwarded-for": `192.0.2.${i}` }))).toBeNull();
    expect(admit(json("{}", { "x-vercel-forwarded-for": "198.51.100.1" }))?.status).toBe(429);
    expect(visitorKey(json("{}", { "x-vercel-forwarded-for": "2001:db8::1" }))).toBe(
      visitorKey(json("{}", { "x-vercel-forwarded-for": "2001:db8:0:0:0:0:0:1" })),
    );
  });
  it("expires windows and never evicts a full budget store to admit new keys", () => {
    let now = 0;
    const budget = new RequestBudget(() => now);
    for (let i = 0; i < LIMITS.buckets; i++) expect(budget.take(String(i), 1)).toBe(true);
    expect(budget.take("extra", 1)).toBe(false);
    expect(budget.take("0", 1)).toBe(false);
    now = LIMITS.windowMs;
    expect(budget.take("0", 1)).toBe(true);
  });
  it("overwrites injected nonces, prevents shared HTML caching and blocks script attributes", () => {
    const request = new NextRequest("https://flop-lab.example/", {
      headers: { "x-nonce": "injected", "content-security-policy": "script-src *" },
    });
    const one = proxy(request),
      two = proxy(request);
    expect(one.headers.get("content-security-policy")).not.toBe(two.headers.get("content-security-policy"));
    expect(one.headers.get("x-middleware-request-x-nonce")).not.toBe("injected");
    expect(one.headers.get("cache-control")).toContain("no-store");
    const policy = contentSecurityPolicy("a".repeat(32));
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy.split(";").find((p) => p.trim().startsWith("script-src "))).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(policy).not.toContain("https://mcp.flop.network");
  });
});

describe("bounded bodies and egress", () => {
  it("replays watch rules locally and refuses reflected YAML errors or cross-site posts", async () => {
    const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const request = (body: string, origin?: string) =>
      new Request("https://flop-lab.example/watch/replay", {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain", ...(origin ? { origin } : {}) },
      });
    const config = { ...example, outputs: [{ kind: "webhook" as const, url: "http://127.0.0.1/private" }] };
    expect((await replayWatch(request(rulesYaml(config)))).status).toBe(200);
    expect(transport).not.toHaveBeenCalled();
    expect((await replayWatch(request("bad", "https://attacker.example"))).status).toBe(403);
    const malformed = await replayWatch(request("version: 1\nversion: internal-path"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid request" });
  });
  it("coalesces trail reads, retains capture time and bounds distinct misses across all hosts", async () => {
    let now = Date.parse("2026-11-06T00:00:00Z");
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("recorded text"));
    const read = createTrailReader(transport, () => now);
    const source = "https://technocore.chat/kv/did/abc";
    const [first, same] = await Promise.all([read(source), read(source)]);
    expect(same).toEqual(first);
    expect(transport).toHaveBeenCalledOnce();
    for (let i = 0; i < 29; i++) await read(`https://technocore.chat/kv/did/f${i}`);
    await expect(read("https://api.github.com/search/issues?q=other")).rejects.toThrow("budget");
    expect(await read(source)).toEqual(first);
    now += 3_600_000;
    expect((await read(source)).measuredAt).not.toBe(first.measuredAt);
  });
  it("ignores malformed platform IPs without throwing or accepting a client list", () => {
    vi.stubEnv("VERCEL", "1");
    for (const value of ["2001:db8::1%eth0", "192.0.2.1, 192.0.2.2", "arbitrary"])
      expect(visitorKey(json("{}", { "x-vercel-forwarded-for": value }))).toBe(visitorKey(json("{}")));
  });
  it.each([
    "http://127.0.0.1",
    "https://169.254.169.254/latest/meta-data/",
    "https://mcp.flop.network.attacker.example/mcp",
    "https://user:password@mcp.flop.network/mcp",
    "https://mcp.flop.network:444/mcp",
    "https://mcp.flop.network/mcp#x",
    "https://api.flop.network/v1/chat/completions",
    "https://raw.githubusercontent.com/other/repo/main/a.json",
    "https://raw.githubusercontent.com/zkasuran/flop-lab/data/../main/package.json",
  ])("denies source %s before fetch", async (source) => {
    const transport = vi.fn<typeof fetch>();
    await expect(createPublicFetch(transport)(source)).rejects.toThrow("Source denied");
    expect(transport).not.toHaveBeenCalled();
  });
  it("accepts only the recorded branch path shape and fixed source URLs", () => {
    expect(allowedSource("https://raw.githubusercontent.com/zkasuran/flop-lab/data/index.json").hostname).toBe(
      "raw.githubusercontent.com",
    );
    expect(allowedSource("https://api.flop.network/v1/models").pathname).toBe("/v1/models");
  });
  it("replays real SSE through the bounded transport and shared MCP parser", async () => {
    const transport = createPublicFetch(replayFetch({ "call-flop_get_stats": stats.raw }));
    const result = await getStats(new McpClient({ fetch: transport, retries: 0, minIntervalMs: 0 }));
    expect(parseStats({ stats: result.value })).toEqual({ block: 2947024, accounts: 5956 });
    expect(stats.measuredAt).toBeTruthy();
  });
  it("rejects excess streaming bytes without trusting Content-Length and cancels", async () => {
    const cancel = vi.fn();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(200_001));
          },
          cancel,
        }),
        { headers: { "Content-Length": "1" } },
      ),
    );
    await expect(createPublicFetch(transport)("https://mcp.flop.network/mcp")).rejects.toThrow(
      "Public source unavailable",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("cancels stalled bodies after headers have arrived", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const promise = readBytes(new ReadableStream({ cancel }), 100, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(await readBytes(null, 100, new AbortController().signal)).toHaveLength(0);
  });
  it("refuses redirects and strips upstream cookies and error pages", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private upstream detail", { status: 503, headers: { "set-cookie": "session=bad" } }),
      );
    const read = createPublicFetch(transport);
    const reply = await read("https://mcp.flop.network/mcp", { redirect: "follow" });
    expect(transport.mock.calls[0]?.[1]?.redirect).toBe("error");
    expect(reply.headers.has("set-cookie")).toBe(false);
    expect(await reply.text()).toBe("");
    await expect(read("https://mcp.flop.network/mcp")).rejects.toThrow("budget");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("cancels downstream reads when a route operation expires", async () => {
    const cancel = vi.fn();
    const read = createPublicFetch(async () => new Response(new ReadableStream({ cancel })));
    const reply = await withPublicOperation(async () => {
      await read("https://mcp.flop.network/mcp");
      return Response.json({});
    }, 10);
    expect(reply.status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("limits concurrent upstream body reads without a waiting queue", async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              controllers.push(c);
            },
          }),
        ),
    );
    const read = createPublicFetch(transport);
    const pending = Array.from({ length: 4 }, () => read("https://mcp.flop.network/mcp"));
    await expect(read("https://mcp.flop.network/mcp")).rejects.toThrow("budget");
    for (const controller of controllers) controller.close();
    await Promise.all(pending);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("returns fixed errors for malformed, empty and oversized console JSON", async () => {
    for (const raw of ["", "{broken-internal-path", "null"]) {
      const reply = await POST(json(raw));
      expect(reply.status).toBe(400);
      expect(await reply.json()).toEqual({ error: "Invalid request" });
      expect(reply.headers.get("cache-control")).toContain("no-store");
    }
    expect((await POST(json("x".repeat(LIMITS.requestBytes + 1)))).status).toBe(413);
    expect(safeJson({ raw: "x".repeat(LIMITS.responseBytes) }).status).toBe(502);
  });
  it("does not expose explorer exceptions", async () => {
    const read = createSearchService({
      search: async () => {
        throw new Error("/internal/path bearer-token");
      },
    });
    const reply = await read(new Request("https://flop-lab.example/explorer/query?q=1"));
    expect(reply.status).toBe(502);
    expect(await reply.text()).not.toMatch(/internal|bearer/);
  });
});

describe("console query and tool policy", () => {
  it.each([
    "mutation { stats { tps } }",
    "subscription { stats { tps } }",
    "{ stats { ...A } } fragment A on Stats { ...A }",
    "{ stats { a { b { c { d { e { f { g { h } } } } } } } } }",
    "{ blocks(limit:101) { number } }",
    "query A { stats { tps } } query B { stats { tps } }",
    "{ " + Array.from({ length: 7 }, (_, i) => `a${i}:stats { tps }`).join(" ") + " }",
    "{ stats { tps } }" + " ".repeat(8192),
  ])("denies hostile GraphQL before dispatch", (query) => {
    expect(() => inspectQuery(query)).toThrow();
  });
  it("enforces variables, alias expansion and the explicit tool allowlist", () => {
    expect(() => inspectQuery("query($n:Int=101) { blocks(limit:$n) { number } }")).toThrow();
    expect(() => inspectQuery("query($n:Int) { blocks(limit:$n) { number } }", { n: 100 })).not.toThrow();
    expect(() =>
      inspectQuery(
        "{ a: stats { ...S } b: stats { ...S } } fragment S on Stats { " +
          Array.from({ length: 51 }, (_, i) => `f${i}:tps`).join(" ") +
          " }",
      ),
    ).toThrow();
    const tools = recordedConsole().catalog.tools;
    const stats = tools.find((tool) => tool.name === "flop_get_stats")!;
    expect(() => validateInput(stats, {})).not.toThrow();
    expect(() => validateInput(stats, { host: "http://127.0.0.1" })).toThrow();
    expect(() => validateInput({ ...stats, allowed: false }, {})).toThrow();
  });
});
