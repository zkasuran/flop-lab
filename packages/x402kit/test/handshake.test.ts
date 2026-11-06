// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { describe, expect, it, vi } from "vitest";
import { checkExchange, parseExchange, type Exchange } from "../src/checker.js";
import { RULES } from "../src/rules.js";
import { createMockService, runMockClient, probeLocal } from "../src/reference.js";
import { parseQuote, quoteHeaders } from "../src/protocol.js";
import { payAndFetch } from "../src/client.js";
import { sdkTrace } from "./sdk-trace.js";
import recording from "../fixtures/handshake.json";
import sdkRecording from "../fixtures/sdk-handshake.json";

const fresh = () => structuredClone(recording) as Exchange;
const codes = (e: Exchange) => checkExchange(e).deviations.map((d) => d.code);

describe("transcript checker", () => {
  it("checks the recorded real loopback exchange and both recorded SDK runs", () => {
    expect(checkExchange(recording).outcome).toBe("no-deviations");
    expect(checkExchange(recording)).toMatchObject({ requestCount: 2, unpaidRequests: 1, proofRequests: 1 });
    expect(checkExchange(sdkRecording.direct.exchange).outcome).toBe("no-deviations");
    expect(checkExchange(sdkRecording.wrapped.exchange).deviations.map((d) => d.code)).toContain(
      "repeated_unpaid_request",
    );
  });
  it("accumulates missing fields rather than stopping at the first one", () => {
    const e = fresh();
    e.rounds = [e.rounds[0]!];
    e.rounds[0]!.response.headers = [];
    expect(checkExchange(e).deviations.filter((d) => d.code === "missing_header")).toHaveLength(11);
  });
  it("does not pass empty, unpaid-only or rejected paid exchanges", () => {
    const e = fresh();
    e.rounds = [];
    expect(checkExchange(e).outcome).toBe("incomplete");
    e.rounds = fresh().rounds.slice(0, 1);
    expect(checkExchange(e).outcome).toBe("incomplete");
    const denied = fresh();
    denied.rounds[1]!.response.status = 503;
    expect(checkExchange(denied).outcome).toBe("incomplete");
  });
  it("reports wrong status and repeated unpaid requests", () => {
    const e = fresh();
    e.rounds[0]!.response.status = 200;
    expect(codes(e)).toEqual(expect.arrayContaining(["wrong_status", "challenge_status", "unquoted_payment"]));
    const repeated = fresh();
    repeated.rounds.splice(1, 0, structuredClone(repeated.rounds[0]!));
    expect(codes(repeated)).toContain("repeated_unpaid_request");
  });
  it("flags duplicate and control-byte headers without folding them away", () => {
    const e = fresh();
    e.rounds[0]!.response.headers.push(["X-PAYMENT-PRICE", "0.02"], ["x-injected", "a\r\nb"]);
    expect(codes(e)).toEqual(expect.arrayContaining(["duplicate_header", "malformed_header"]));
  });
  it("accepts header case changes and flags changed bodies", () => {
    const e = fresh();
    for (const r of e.rounds) r.response.headers = r.response.headers.map(([k, v]) => [k.toUpperCase(), v]);
    expect(checkExchange(e).outcome).toBe("no-deviations");
    e.rounds[1]!.request.body = "changed";
    expect(codes(e)).toContain("request_changed");
  });
  it("detects canonical transaction and HTLC reuse across quotes", () => {
    const e = fresh(),
      second = fresh();
    for (const r of second.rounds) {
      r.request.headers = r.request.headers.map(([k, v]) => [
        k,
        k.toLowerCase() === "x-flop-request-id" ? "different-request-0001" : v,
      ]);
      r.response.headers = r.response.headers.map(([k, v]) => [
        k,
        k.toLowerCase() === "x-flop-request-id" ? "different-request-0001" : v,
      ]);
    }
    e.rounds.push(...second.rounds);
    expect(codes(e)).toEqual(expect.arrayContaining(["payment_replayed", "replay_accepted"]));
  });
  it("permits an identical cached retry but diagnoses changed response bytes", () => {
    const e = fresh();
    e.rounds.push(structuredClone(e.rounds[1]!));
    e.rounds[2]!.response.headers = e.rounds[2]!.response.headers.reverse().map(([key, value]) => [
      key.toUpperCase(),
      value,
    ]);
    expect(checkExchange(e).outcome).toBe("no-deviations");
    e.rounds[2]!.response.body = "executed again";
    expect(codes(e)).toContain("cached_response_changed");
  });
  it("bounds capture size in UTF-8 bytes rather than JavaScript character count", () => {
    const e = fresh();
    e.rounds[0]!.response.body = "é".repeat(65536);
    expect(() => parseExchange(e)).toThrow("Exchange exceeds 128 KiB");
  });
  it("rejects expired retry at the exact recorded boundary", () => {
    const e = fresh();
    const expiry = new Map(e.rounds[0]!.response.headers).get("x-flop-expires-at")!;
    e.rounds[1]!.measuredAt = new Date(Number(expiry)).toISOString();
    expect(codes(e)).toContain("quote_expired");
  });
  it.each([
    null,
    {},
    [],
    { ...recording, rounds: Array(17).fill(recording.rounds[0]) },
    { ...recording, measuredAt: "yesterday" },
  ])("rejects malformed capture %j", (value) => {
    expect(() => parseExchange(value)).toThrow();
  });
  it("quotes actual retained SDK lines for every external rule", async () => {
    const js = Buffer.from(
      await readFile(new URL("../fixtures/sdk-dist-x402.js.base64", import.meta.url), "utf8"),
      "base64",
    ).toString();
    const dts = Buffer.from(
      await readFile(new URL("../fixtures/sdk-dist-x402.d.ts.base64", import.meta.url), "utf8"),
      "base64",
    ).toString();
    for (const rule of Object.values(RULES))
      if (rule.basis.startsWith("SDK")) expect(rule.source.endsWith(".d.ts") ? dts : js).toContain(rule.quote);
  });
});

describe("bounded mock reference", () => {
  it("preserves request binding over real Node HTTP transport", async () => {
    const server = serve({ fetch: createMockService().fetch, hostname: "127.0.0.1", port: 3593 });
    try {
      const run = await runMockClient("http://127.0.0.1:3593/paid");
      expect(run.error).toBeNull();
      expect(run.report).toMatchObject({ outcome: "no-deviations", requestCount: 2 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("uses one unpaid request, releases once and returns the same cached response", async () => {
    const service = createMockService();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      service.fetch(new Request(input, init)),
    );
    const run = await runMockClient("http://127.0.0.1:3592/paid", fetcher);
    expect(run.error).toBeNull();
    expect(run.report.outcome).toBe("no-deviations");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const r = run.exchange.rounds[1]!.request;
    const again = await service.fetch(new Request(r.url, { method: r.method, headers: r.headers }));
    expect(await again.json()).toMatchObject({ executions: 1, mock: true });
  });
  it("one local probe is incomplete and performs no mock retry", async () => {
    const service = createMockService();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => service.fetch(new Request(input)));
    expect((await probeLocal("http://127.0.0.1:3592/paid", fetcher)).report.outcome).toBe("incomplete");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    "https://api.flop.network/v1/models",
    "http://localhost:3592/paid",
    "http://127.0.0.1.example.com/paid",
    "http://user@127.0.0.1/paid",
  ])("refuses nonliteral loopback target %s", async (url) => {
    const fetcher = vi.fn();
    await expect(runMockClient(url, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reproduces SDK issue 89 twice using the pinned artifact", async () => {
    for (let i = 0; i < 2; i++) {
      expect(await sdkTrace("function")).toMatchObject({ status: 200, mockPayments: 1 });
      const broken = await sdkTrace("class");
      expect(broken).toMatchObject({ status: 429, mockPayments: 0 });
      expect(checkExchange(broken.exchange).deviations.map((d) => d.code)).toContain("repeated_unpaid_request");
    }
  });
  it("refuses expiry after the payment callback before sending proof", async () => {
    const service = createMockService();
    let now = Date.now();
    const send = vi.fn(async (input: RequestInfo | URL) => service.fetch(new Request(input)));
    await expect(
      payAndFetch(new Request("http://127.0.0.1:3592/paid"), {
        maxFlop: "0.01",
        expectedPayTo: "MOCK-NO-FUNDS",
        now: () => now,
        fetch: send,
        pay: async (q) => {
          now = q.expiresAt;
          return { hash_lock: q.hashLock, htlc_id: "mock-id", tx_hash: "b".repeat(64) };
        },
      }),
    ).rejects.toThrow("quote_expired");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

const malformed = [
  "",
  " ",
  "null",
  "[]",
  "{}",
  "true",
  "0",
  "{",
  "NaN",
  "Infinity",
  "1e3",
  "-1",
  "0x10",
  "1junk",
  "1, 2",
  "a".repeat(2049),
  JSON.stringify({ hashLock: "a".repeat(64), htlcId: "mock", txHash: "b".repeat(64) }),
  `{"hash_lock":"${"a".repeat(64)}","hash_lock":"${"a".repeat(64)}","htlc_id":"mock","tx_hash":"${"b".repeat(64)}"}`,
];

describe("deterministic malformed-header fuzz corpus", () => {
  it.each(malformed)("server rejects proof %j before release", async (header) => {
    const service = createMockService();
    const request = new Request("http://127.0.0.1:3592/paid", {
      headers: { "x-flop-request-id": "fuzz-request-0001" },
    });
    await service.fetch(request.clone());
    request.headers.set("x-payment-proof", header);
    const response = await service.fetch(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "malformed_proof" });
  });
  it.each([
    "x-payment-price",
    "x-payment-hash-lock",
    "x-payment-timeout-blocks",
    "x-payment-required",
    "x-payment-network",
    "x-payment-asset",
    "x-flop-expires-at",
    "x-flop-executable",
  ])("client refuses malformed %s before payment", async (name) => {
    for (const value of malformed) {
      if (value === "true" && ["x-payment-required", "x-flop-executable"].includes(name)) continue;
      const service = createMockService();
      const pay = vi.fn();
      await expect(
        payAndFetch(new Request("http://127.0.0.1:3592/paid"), {
          maxFlop: "0.01",
          expectedPayTo: "MOCK-NO-FUNDS",
          pay,
          fetch: async (input) => {
            const response = await service.fetch(new Request(input));
            const q = parseQuote(response);
            const headers = quoteHeaders(q);
            headers.set(name, value);
            return new Response(null, { status: 402, headers });
          },
        }),
      ).rejects.toThrow();
      expect(pay).not.toHaveBeenCalled();
    }
  });
});
