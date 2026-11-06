// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { FileStore, MemoryStore, paywall, honoPaywall, parseQuote, payAndFetch, flopUnits } from "../src/index.js";
import type { Proof, Quote, ReplayStore } from "../src/index.js";

const id = "test-request-id-0001";
function request(path = "/paid", method = "GET", proof?: Proof, requestId = id) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "X-Flop-Request-Id": requestId, ...(proof ? { "X-Payment-Proof": JSON.stringify(proof) } : {}) },
  });
}
const tx = `0x${"b".repeat(64)}`;
function observed(q: Quote, p: Proof) {
  return {
    network: "flop-devnet",
    asset: "FLOP",
    status: "SETTLED",
    finalized: true,
    canonical: true,
    hashLock: q.hashLock,
    htlcId: p.htlc_id,
    txHash: p.tx_hash,
    amountFlop: "0.01",
    payTo: q.payTo,
    blockHash: "c".repeat(64),
    source: "https://mcp.flop.network/mcp",
    observedAt: "2026-11-05T12:00:00Z",
  };
}
async function setup(store: ReplayStore = new MemoryStore()) {
  let time = 1000;
  let evidence: unknown;
  const read = vi.fn(async () => evidence);
  const handler = vi.fn(() => Response.json({ result: "paid" }));
  const wall = paywall({
    priceFlop: "0.01",
    payTo: "test-only-payee",
    ttl: 100,
    now: () => time,
    store,
    readPayment: read,
  });
  const quote = parseQuote(await wall(request(), handler));
  const proof = { hash_lock: quote.hashLock, htlc_id: "htlc-test-1", tx_hash: tx };
  evidence = observed(quote, proof);
  return {
    wall,
    quote,
    proof,
    read,
    handler,
    set: (v: unknown) => {
      evidence = v;
    },
    expire: () => {
      time = 1100;
    },
  };
}

describe("failure matrix", () => {
  it.each([
    ["underpay", { amountFlop: "0.009" }, 402, "amount_mismatch"],
    ["overpay", { amountFlop: "0.011" }, 402, "amount_mismatch"],
    ["wrong payee", { payTo: "someone-else" }, 402, "wrong_payee"],
    ["unfinalized", { finalized: false }, 409, "not_finalized"],
    ["reorg", { canonical: false }, 409, "not_finalized"],
    ["partial settlement", { status: "PARTIAL" }, 409, "not_finalized"],
    ["different HTLC", { htlcId: "other" }, 402, "payment_mismatch"],
    ["different transaction", { txHash: "d".repeat(64) }, 402, "payment_mismatch"],
    ["wrong network", { network: "flop-mainnet" }, 402, "wrong_network"],
    ["no provenance", { observedAt: null }, 503, "missing_provenance"],
  ])("%s", async (_name, patch, status, error) => {
    const s = await setup();
    s.set({ ...observed(s.quote, s.proof), ...patch });
    const r = await s.wall(request("/paid", "GET", s.proof), s.handler);
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ error });
    expect(s.handler).not.toHaveBeenCalled();
  });
  it("rejects expiration at the exact boundary", async () => {
    const s = await setup();
    s.expire();
    const r = await s.wall(request("/paid", "GET", s.proof), s.handler);
    expect(r.status).toBe(410);
    expect(await r.json()).toEqual({ error: "quote_expired" });
    expect(s.read).not.toHaveBeenCalled();
  });
  it.each([
    ["/other", "GET"],
    ["/paid", "POST"],
    ["/paid?changed=1", "GET"],
  ])("binds %s %s", async (path, method) => {
    const s = await setup();
    const r = await s.wall(request(path, method, s.proof), s.handler);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "request_mismatch" });
    expect(s.handler).not.toHaveBeenCalled();
  });
  it("rejects malformed headers before reading state", async () => {
    const s = await setup();
    const req = request();
    req.headers.set("X-Payment-Proof", "{invalid}");
    const r = await s.wall(req, s.handler);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "malformed_proof" });
    expect(s.read).not.toHaveBeenCalled();
  });
  it("fails closed without an adapter", async () => {
    const wall = paywall({ priceFlop: "0.01", payTo: "UNVERIFIED", ttl: 60000 });
    const q = parseQuote(await wall(request(), () => new Response("bad")));
    const r = await wall(
      request("/paid", "GET", { hash_lock: q.hashLock, htlc_id: "test", tx_hash: tx }),
      () => new Response("bad"),
    );
    expect(q.executable).toBe(false);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "chain_adapter_unverified" });
  });
});

describe.each(["memory", "file"])("%s store contract", (kind) => {
  it("replays the exact response after expiry and restart without executing twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "x402-test-"));
    try {
      const file = join(directory, "state.json");
      const store = kind === "file" ? new FileStore(file) : new MemoryStore();
      const s = await setup(store);
      const first = await s.wall(request("/paid", "GET", s.proof), s.handler);
      expect(first.status).toBe(200);
      const body = await first.text();
      s.expire();
      const again =
        kind === "file"
          ? paywall({ priceFlop: "0.01", payTo: "test-only-payee", ttl: 100, store: new FileStore(file) })
          : s.wall;
      const second = await again(request("/paid", "GET", s.proof), s.handler);
      expect(second.status).toBe(200);
      expect(await second.text()).toBe(body);
      expect(s.handler).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("serializes competing transactions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "x402-test-"));
    try {
      const store = kind === "file" ? new FileStore(join(directory, "state.json")) : new MemoryStore();
      await Promise.all(
        Array.from({ length: 8 }, (_, n) =>
          store.transaction((s) => {
            s.used[String(n)] = String(n);
          }),
        ),
      );
      expect(await store.transaction((s) => Object.keys(s.used).length)).toBe(8);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it("preserves the claim after a handler failure", async () => {
  const s = await setup();
  const bad = vi.fn(() => {
    throw new Error("failed");
  });
  const first = await s.wall(request("/paid", "GET", s.proof), bad);
  const second = await s.wall(request("/paid", "GET", s.proof), bad);
  expect(first.status).toBe(500);
  expect(await second.json()).toEqual({ error: "handler_failed" });
  expect(bad).toHaveBeenCalledTimes(1);
});

it("rejects reuse of a transaction for another quote", async () => {
  const s = await setup();
  await s.wall(request("/paid", "GET", s.proof), s.handler);
  const q2 = parseQuote(await s.wall(request("/paid", "GET", undefined, "different-request-2"), s.handler));
  const p2 = { ...s.proof, hash_lock: q2.hashLock };
  s.set(observed(q2, p2));
  const r = await s.wall(request("/paid", "GET", p2, "different-request-2"), s.handler);
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "payment_replayed" });
  expect(s.handler).toHaveBeenCalledTimes(1);
});

it("does not run concurrent duplicates twice", async () => {
  const s = await setup();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => s.wall(request("/paid", "GET", s.proof), s.handler)),
  );
  expect(results.filter((r) => r.status === 200).length).toBeGreaterThan(0);
  for (const r of results) expect(r.status).toBe(200);
  expect(s.handler).toHaveBeenCalledTimes(1);
  expect((await s.wall(request("/paid", "GET", s.proof), s.handler)).status).toBe(200);
});

it("rejects reuse of an HTLC under a different transaction hash", async () => {
  const s = await setup();
  await s.wall(request("/paid", "GET", s.proof), s.handler);
  const q2 = parseQuote(await s.wall(request("/paid", "GET", undefined, "different-request-2"), s.handler));
  const p2 = { ...s.proof, hash_lock: q2.hashLock, tx_hash: `0x${"e".repeat(64)}` };
  s.set(observed(q2, p2));
  const response = await s.wall(request("/paid", "GET", p2, "different-request-2"), s.handler);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "payment_replayed" });
  expect(s.handler).toHaveBeenCalledTimes(1);
});

it("protects Hono routes", async () => {
  const app = new Hono();
  app.use("/paid", honoPaywall({ priceFlop: "0.01", payTo: "UNVERIFIED", ttl: 60000 }));
  app.get("/paid", (c) => c.text("should not execute"));
  expect((await app.fetch(request())).status).toBe(402);
});

it("rejects corrupt persistent state rather than forgetting spent payments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "x402-test-"));
  try {
    const file = join(directory, "state.json");
    await writeFile(file, "{}");
    await expect(new FileStore(file).transaction(() => null)).rejects.toThrow("store_corrupt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("bounded client", () => {
  it.each(["ceiling", "payee", "expired", "policy", "delayed-policy", "unavailable"])(
    "refuses %s before spending",
    async (mode) => {
      let time = 1000;
      const wall = paywall({
        priceFlop: "0.01",
        payTo: "test-only-payee",
        ttl: 100,
        now: () => 1000,
        ...(mode === "unavailable" ? {} : { readPayment: async () => null }),
      });
      const pay = vi.fn();
      if (mode === "expired") time = 1100;
      await expect(
        payAndFetch(request(), {
          maxFlop: mode === "ceiling" ? "0.009999999999999999" : "0.01",
          expectedPayTo: mode === "payee" ? "different" : "test-only-payee",
          now: () => time,
          pay,
          authorize: () => {
            if (mode === "delayed-policy") time = 1100;
            return mode !== "policy";
          },
          fetch: async (r) => wall(r as Request, () => new Response("ok")),
        }),
      ).rejects.toThrow();
      expect(pay).not.toHaveBeenCalled();
    },
  );
  it("pays only once and sends the snake_case proof on retry", async () => {
    let evidence: unknown;
    const wall = paywall({
      priceFlop: "0.01",
      payTo: "test-only-payee",
      ttl: 60000,
      readPayment: async () => evidence,
    });
    const pay = vi.fn(async (q: Quote) => {
      const p = { hash_lock: q.hashLock, htlc_id: "test", tx_hash: tx };
      evidence = observed(q, p);
      return p;
    });
    const fetcher = vi.fn(async (r) => wall(r as Request, () => new Response("ok")));
    const result = await payAndFetch(request(), {
      maxFlop: "0.01",
      expectedPayTo: "test-only-payee",
      pay,
      fetch: fetcher,
    });
    expect(await result.text()).toBe("ok");
    expect(pay).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["NaN", "Infinity", "1e-3", "-1", "0.0000000000000000001", "1junk"])("rejects %s", (value) => {
    expect(() => flopUnits(value)).toThrow();
  });
});
