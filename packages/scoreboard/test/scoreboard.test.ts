// SPDX-License-Identifier: Apache-2.0
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSnapshot, rankSnapshot, pickMiner, sensitivity, WINDOW_MS, Collector, type Snapshot } from "../src/index";
import { parseModels, parseSettlements } from "../src/schema";
import empty from "../fixtures/empty-filter.json";

const fixture = (tag: string) =>
  parseSnapshot(JSON.parse(readFileSync(new URL(`../fixtures/snapshot-${tag}.json`, import.meta.url), "utf8")));
const first = fixture("01");
const now = Date.parse(first.measuredAt);
const model = "qwen/qwen2.5-0.5b-instruct";
const record = (s: Snapshot, kind: string) => s.records.find((r) => r.kind === kind)!;
const miner = parseModels(record(first, "models"))[0]!.miner;

function controlled(): Snapshot {
  const snapshot = structuredClone(first);
  const settlements = record(snapshot, "settlements");
  const row = {
    ...parseSettlements(settlements)[0]!.raw,
    miner,
    agent: "agent-one",
    channelId: "controlled",
    cooperative: true,
    settledAt: Date.parse(settlements.measuredAt),
    selfTrade: false,
    escrow: "100",
    minerPaid: "90",
    burned: "0",
    unusedEscrow: "10",
  };
  settlements.raw = { data: [row], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } };
  return snapshot;
}
const evaluated = Date.parse(record(first, "settlements").measuredAt);

describe("recorded snapshots and hostile boundaries", () => {
  it.each(["01", "02", "03"])("validates real recording %s and stays below fixture size cap", (tag) => {
    const snapshot = fixture(tag);
    expect(snapshot.collection.requests).toBe(5);
    expect(parseModels(record(snapshot, "models")).length).toBeGreaterThan(0);
    expect(statSync(new URL(`../fixtures/snapshot-${tag}.json`, import.meta.url)).size).toBeLessThan(200_000);
    const rows = rankSnapshot(snapshot, { now: Date.parse(snapshot.measuredAt) });
    expect(rows.some((row) => row.score !== null)).toBe(true);
    expect(rows.every((row) => Number.isFinite(row.confidence) && row.confidence <= 0.5)).toBe(true);
  });
  it("records minutes apart and the first price source expires before the last recording", () => {
    const last = fixture("03");
    expect(Date.parse(last.measuredAt) - now).toBeGreaterThanOrEqual(240_000);
    expect(Date.parse(parseModels(record(first, "models"))[0]!.expiresAt)).toBeLessThan(Date.parse(last.measuredAt));
  });
  it("keeps the empty model query distinct from a whole-network claim", () => {
    const s = structuredClone(first);
    record(s, "settlements").raw = empty.raw;
    expect(rankSnapshot(s, { now }).every((r) => r.score === null && r.confidence === 0)).toBe(true);
    expect(pickMiner(s, { model, now, minConfidence: 0 }).status).toBe("no-eligible-miner");
    record(s, "models").raw = { data: [] };
    expect(rankSnapshot(s, { now })).toEqual([]);
    expect(pickMiner(s, { model, now }).status).toBe("no-eligible-miner");
  });
  it.each([
    (s: Snapshot) => {
      Object.assign(s, { schemaVersion: 2 });
    },
    (s: Snapshot) => {
      s.measuredAt = "yesterday";
    },
    (s: Snapshot) => {
      s.records[0]!.source = "https://example.com";
    },
    (s: Snapshot) => {
      s.records.push(s.records[0]!);
    },
    (s: Snapshot) => {
      record(s, "models").raw = { data: [{ id: "x" }] };
    },
    (s: Snapshot) => {
      record(s, "settlements").raw = { data: [], pagination: {} };
    },
    (s: Snapshot) => {
      const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
      rows[0]!.pricePerGflop = "NaN";
    },
    (s: Snapshot) => {
      const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
      rows[0]!.selfTrade = "false";
    },
    (s: Snapshot) => {
      const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
      rows[0]!.escrow = "1e50";
    },
    (s: Snapshot) => {
      const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
      rows[1] = rows[0]!;
    },
  ])("rejects malformed data before scoring", (mutate) => {
    const s = structuredClone(first);
    mutate(s);
    expect(() => parseSnapshot(s)).toThrow();
  });
});

describe("formula and confidence", () => {
  it("keeps scores invariant when weights scale and rejects overflowing sums", () => {
    const base = rankSnapshot(controlled(), { now: evaluated });
    const scaled = rankSnapshot(controlled(), { now: evaluated, weights: { cooperative: 7e306, recency: 3e306 } });
    expect(scaled.find((r) => r.miner === miner)!.score).toBeCloseTo(base.find((r) => r.miner === miner)!.score!, 12);
    expect(() =>
      rankSnapshot(controlled(), { weights: { cooperative: Number.MAX_VALUE, recency: Number.MAX_VALUE } }),
    ).toThrow("invalid weights");
  });
  it("matches the written formula for one cooperative observation", () => {
    const row = rankSnapshot(controlled(), { now: evaluated }).find((r) => r.miner === miner)!;
    expect(row.confidence).toBeCloseTo(1 / 21 / 5, 12);
    expect(row.score).toBeCloseTo(100 / 21 / 5, 12);
    expect(row.terms[0]!.contribution).toBeCloseTo(70 / 21 / 5, 12);
    expect(row.terms[1]!.contribution).toBeCloseTo(30 / 21 / 5, 12);
    expect(row.unusedEscrowRatio).toBe(0.1);
    expect(row.confidenceLabel).toBe("low");
  });
  it("penalizes noncooperation and age exactly, without interpreting forced settlement as fraud", () => {
    const s = controlled();
    const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
    rows[0]!.cooperative = false;
    const row = rankSnapshot(s, { now: evaluated + WINDOW_MS / 2 }).find((r) => r.miner === miner)!;
    expect(row.score).toBeCloseTo(15 / 21 / 5, 12);
    expect(rankSnapshot(s, { now: evaluated + WINDOW_MS / 4 }).find((r) => r.miner === miner)!.score).toBeCloseTo(
      22.5 / 21 / 5,
      12,
    );
    expect(row.noncooperativeShare).toBe(1);
    expect(rankSnapshot(s, { now: evaluated + WINDOW_MS + 1 }).find((r) => r.miner === miner)!.score).toBeNull();
  });
  it.each(["selfTrade", "nonconserving", "future"])("excludes %s evidence", (kind) => {
    const s = controlled();
    const rows = record(s, "settlements").raw.data as Record<string, unknown>[];
    if (kind === "selfTrade") rows[0]!.selfTrade = true;
    if (kind === "nonconserving") rows[0]!.minerPaid = "91";
    if (kind === "future") rows[0]!.settledAt = now + 1;
    expect(rankSnapshot(s, { now }).find((r) => r.miner === miner)!.score).toBeNull();
  });
  it("perturbs every weight and reports real rank movements on a tradeoff fixture", () => {
    const s = controlled();
    const r = record(s, "settlements");
    const base = (r.raw.data as Record<string, unknown>[])[0]!;
    const a = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      channelId: `a${i}`,
      agent: `a${i % 5}`,
      settledAt: evaluated - WINDOW_MS * 0.49,
    }));
    const b = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      miner: "other",
      channelId: `b${i}`,
      agent: `b${i % 5}`,
      cooperative: i < 8,
    }));
    r.raw = { data: [...a, ...b], pagination: { total: 20, offset: 0, limit: 100, hasMore: false } };
    const changes = sensitivity(s, { now: evaluated });
    expect(changes).toHaveLength(4);
    expect(changes.some((r) => r.moves.length > 0)).toBe(true);
    expect(sensitivity(first, { now })).toHaveLength(4);
  });
});

describe("router invariants", () => {
  it("never substitutes historical prices for a live ceiling", () => {
    const result = pickMiner(first, { model, now, minConfidence: 0, maxPricePerGflop: "999999999999999999999" });
    expect(result.status).toBe("no-eligible-miner");
    expect(result.candidates.every((r) => r.reasons.includes("live-price-unknown"))).toBe(true);
  });
  it("rejects at the exact expiry boundary", () => {
    const p = parseModels(record(first, "models"))[0]!;
    const result = pickMiner(first, { model, now: Date.parse(p.expiresAt), minConfidence: 0 });
    expect(result.status).toBe("no-eligible-miner");
    expect(result.candidates.find((r) => r.miner === p.miner)!.reasons).toContain("price-source-expired");
  });
  it("checks generated policies non-vacuously and is deterministic", () => {
    let picks = 0;
    for (let i = 0; i < 100; i++) {
      const exclude = i % 3 === 0 ? [miner] : [];
      const options = { model, now: now + i * 3000, minConfidence: (i % 5) / 10, exclude };
      const result = pickMiner(first, options);
      expect(pickMiner(first, options)).toEqual(result);
      if (result.status === "picked") {
        picks++;
        expect(exclude).not.toContain(result.miner);
        expect(result.explanation.confidence).toBeGreaterThanOrEqual(options.minConfidence);
        const p = parseModels(record(first, "models")).find((p) => p.miner === result.miner && p.model === model)!;
        expect(options.now).toBeLessThan(Date.parse(p.expiresAt));
        expect(options.now).toBeGreaterThanOrEqual(Date.parse(p.effectiveAt));
        expect(result.candidates.find((r) => r.miner === result.miner)!.reasons).toEqual([]);
      }
    }
    expect(picks).toBeGreaterThan(0);
  });
  it("adding worse evidence never changes the pick", () => {
    const s = controlled();
    const options = { model, now, minConfidence: 0 };
    const baseline = pickMiner(s, options);
    expect(baseline.status).toBe("picked");
    for (let i = 0; i < 30; i++) {
      const next = structuredClone(s);
      const r = record(next, "settlements");
      const rows = r.raw.data as Record<string, unknown>[];
      rows.push({
        ...rows[0],
        miner: `worse-${i}`,
        channelId: `worse-${i}`,
        cooperative: false,
        settledAt: evaluated - i * 1000,
      });
      (r.raw.pagination as Record<string, unknown>).total = 2;
      const models = record(next, "models").raw.data as Record<string, unknown>[];
      const sources = (models[0]!["x-flop"] as Record<string, unknown>).price_sources as Record<string, unknown>[];
      sources.push({ ...sources[0], miner_address: `worse-${i}` });
      const result = pickMiner(next, options);
      expect(result.status).toBe("picked");
      if (baseline.status === "picked" && result.status === "picked") expect(result.miner).toBe(baseline.miner);
    }
  });
  it.each(["NaN", "-1", "1e3"])("rejects malformed price %s", (price) => {
    expect(() => pickMiner(first, { model, maxPricePerGflop: price })).toThrow();
  });
});

describe("collector replay", () => {
  function replay(failures: number[] = []) {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push(String(input));
      const failure = failures.shift();
      if (failure) return new Response("busy", { status: failure, headers: { "Retry-After": "1" } });
      if (String(input).endsWith("/models")) return Response.json(record(first, "models").raw);
      const request = JSON.parse(String(init?.body)) as { id: number; params: { name: string } };
      const observed = first.records.find((r) => r.source.endsWith(`#${request.params.name}`))!;
      return new Response(
        `data: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(observed.raw) }] } })}\n\n`,
      );
    };
    return { fetcher, calls };
  }
  it("counts requests, shares in-flight work and does not let caller mutation poison the cache", async () => {
    const { fetcher, calls } = replay();
    let clock = now;
    const c = new Collector({ fetch: fetcher, now: () => clock, sleep: async () => {} });
    const [a, b] = await Promise.all([c.snapshot(), c.snapshot()]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(7);
    expect(a.reliabilityError).toBeDefined();
    expect(a.archive?.state).toBe("unavailable");
    a.records.length = 0;
    expect((await c.snapshot()).records).toHaveLength(5);
    expect(c.stats.cacheHits).toBe(1);
    clock += 60_000;
    await c.snapshot();
    expect(calls).toHaveLength(14);
  });
  it("honors bounded backoff on 429 and 5xx", async () => {
    const { fetcher } = replay([429, 503]);
    const waits: number[] = [];
    const c = new Collector({
      fetch: fetcher,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const snapshot = await c.snapshot();
    expect(snapshot.collection.requests).toBe(9);
    expect(waits[0]).toBe(1000);
    expect(waits[1]).toBe(1000);
  });
  it("does not retry 403 or serve an expired cache as live after a failure", async () => {
    const { fetcher, calls } = replay([403]);
    const c = new Collector({ fetch: fetcher, now: () => now, sleep: async () => {} });
    await expect(c.snapshot()).rejects.toThrow("403");
    expect(calls).toHaveLength(1);
    await expect(c.snapshot()).resolves.toHaveProperty("schemaVersion", 1);
  });
});
