// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Evidence } from "@flop-lab/harness";
import { analyze, appendIndex, entryFor, modelMiners, rss } from "../src/analysis";
import { fetchHistory } from "../src/feed";
import { recordSnapshot } from "../src/record";
import { contentHash, parseIndex, parseSnapshot, seal, validateValue, type Snapshot } from "../src/schema";
import { readIndex, storeSnapshot } from "../src/store";
import { parseFallback, withRecording } from "../../../apps/web/app/history/fallback";
import type { Snapshot as HomeSnapshot } from "../../../apps/web/lib/devnet";

const seed = new URL("./fixtures/seed/", import.meta.url);
const index = parseIndex(JSON.parse(await readFile(new URL("index.json", seed), "utf8")));
const snapshots = await Promise.all(
  index.entries.map(async (entry) => parseSnapshot(JSON.parse(await readFile(new URL(entry.path, seed), "utf8")))),
);
const first = snapshots[0]!;
const last = snapshots.at(-1)!;
afterEach(() => vi.useRealTimers());

it("uses newer recorded miners only when live data failed and validates the model projection", () => {
  const observation = { value: null, measuredAt: null, source: "fixture", stale: true, error: "timeout" };
  const home: HomeSnapshot = {
    stats: observation,
    miners: observation,
    settlements: observation,
    renderedAt: first.startedAt,
  };
  const fallback = parseFallback({
    mode: "recorded-fixture",
    measuredAt: last.observations.models.measuredAt,
    source: last.observations.models.source,
    snapshotId: last.id,
    miners: modelMiners(last),
    models: 1,
  })!;
  expect(withRecording(home, fallback).miners.value).toEqual(modelMiners(last));
  expect(withRecording(home, fallback).miners.source).toContain("Recorded snapshot");
  expect(withRecording(home, fallback).miners.error).toBe("timeout");
  const live = { ...home, miners: { ...home.miners, stale: false, value: [] } };
  expect(withRecording(live, fallback)).toBe(live);
  const newer = { ...home, miners: { ...home.miners, measuredAt: "2099-01-01T00:00:00.000Z" } };
  expect(withRecording(newer, fallback)).toBe(newer);
  expect(() => parseFallback({ ...fallback, miners: ["invalid"] })).toThrow("miners");
});

describe("recorded public sources", () => {
  it("validates content hashes and derives the seed index from live bytes", () => {
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots.reduce(appendIndex, { version: 1, entries: [] })).toEqual(index);
    for (const snapshot of snapshots) {
      expect(Buffer.byteLength(JSON.stringify(snapshot) + "\n")).toBeLessThan(100_000);
      expect(snapshot.requests).toBeLessThanOrEqual(snapshot.maxRequests);
      expect(modelMiners(snapshot).length).toBeGreaterThan(0);
    }
  });
  it("replays every request through the shared MCP client and the real harness", async () => {
    const directory = new URL(`./fixtures/raw/${first.id}/`, import.meta.url);
    const names = (await readdir(directory)).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
    const evidence: Evidence[] = await Promise.all(
      names.map(async (name) => JSON.parse(await readFile(new URL(name, directory), "utf8")) as Evidence),
    );
    let requests = 0;
    const replay: typeof fetch = async (url, init) => {
      const item = evidence[requests++];
      if (!item) throw new Error("Unexpected request");
      expect(String(url)).toBe(item.request.url);
      const normalize = (raw?: string) => {
        if (!raw) return null;
        const { id: _id, ...rest } = JSON.parse(raw) as Record<string, unknown>;
        return rest;
      };
      expect(normalize(init?.body as string)).toEqual(normalize(item.request.body));
      return new Response(item.response, { status: item.status ?? 200 });
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(first.startedAt));
    const run = await recordSnapshot({ fetch: replay, intervalMs: 0 });
    expect(run.snapshot.requests).toBe(first.requests);
    expect(requests).toBe(evidence.length);
    for (const [key, observation] of Object.entries(first.observations)) {
      expect(run.snapshot.observations[key as keyof Snapshot["observations"]].status).toBe(observation.status);
      if (key !== "harness")
        expect(run.snapshot.observations[key as keyof Snapshot["observations"]].value).toEqual(observation.value);
    }
    expect(entryFor(run.snapshot).claims.map((c) => c.status)).toEqual(entryFor(first).claims.map((c) => c.status));
  });
  it("bounds outage attempts and records unknown data instead of zero", async () => {
    let calls = 0;
    const run = await recordSnapshot({
      fetch: async () => {
        calls++;
        return new Response("unavailable", { status: 403 });
      },
      intervalMs: 0,
    });
    expect(calls).toBeLessThanOrEqual(24);
    expect(run.snapshot.requests).toBe(calls);
    expect(run.snapshot.observations.stats.status).toBe("unavailable");
    expect(entryFor(run.snapshot).fields["stats.latestBlockNumber"]).toBeUndefined();
  });
});

describe("reset signals and claim transitions", () => {
  it("does not treat increasing or equal counts as resets", () => {
    const entry = structuredClone(index.entries[0]!);
    const next = structuredClone(index.entries[1]!);
    for (const [field, point] of Object.entries(entry.fields))
      if (typeof point.value === "number") next.fields[field] = { ...point, value: point.value + 1 };
    next.fields["indexer.block.hash"] = entry.fields["indexer.block.hash"]!;
    expect(analyze({ version: 1, entries: [entry, next] }).events.filter((e) => e.kind === "reset-signal")).toEqual([]);
  });
  it("detects decreases, genesis drift and claim changes across missing runs", () => {
    const a = structuredClone(index.entries[0]!);
    const b = structuredClone(index.entries[1]!);
    a.fields["stats.latestBlockNumber"]!.value = 100;
    b.fields["stats.latestBlockNumber"]!.value = 1;
    a.fields["stats.totalAccounts"]!.value = 50;
    b.fields["stats.totalAccounts"]!.value = 0;
    a.fields["indexer.block.hash"] = {
      value: "0x" + "a".repeat(64),
      source: "fixture: synthetic mutation",
      measuredAt: a.measuredAt,
    };
    b.fields["indexer.block.hash"] = { ...a.fields["indexer.block.hash"], value: "0x" + "b".repeat(64) };
    a.claims[0]!.status = "PASS";
    b.claims[0]!.status = "UNVERIFIABLE";
    const gap = { ...a, fields: {}, claims: [], id: "gap" };
    const result = analyze({ version: 1, entries: [a, gap, b] });
    expect(result.events.map((e) => e.field)).toEqual(
      expect.arrayContaining(["stats.latestBlockNumber", "stats.totalAccounts", "indexer.block.hash", a.claims[0]!.id]),
    );
    expect(result.series["stats.totalAccounts"]![1]!.value).toBeNull();
    expect(result.events.find((e) => e.field === "stats.totalAccounts")!.after).toBe(0);
    expect(result.events.find((e) => e.kind === "claim-change")!.before).toBe("PASS");
  });
  it("has no changes or invented series without observations", () => {
    expect(analyze({ version: 1, entries: [] })).toEqual({ series: {}, events: [] });
    expect(rss({ version: 1, entries: [] })).toContain("No data yet");
  });
  it("escapes all untrusted event text in RSS", () => {
    const a = structuredClone(index.entries[0]!);
    const b = structuredClone(index.entries[1]!);
    a.claims = [{ id: "<script>&", measuredAt: a.measuredAt, source: "<x>", reason: "test", status: "PASS" }];
    b.claims = [{ ...a.claims[0]!, status: "FAIL" }];
    const feed = rss({ version: 1, entries: [a, b] });
    expect(feed).toContain("&lt;script&gt;&amp;");
    expect(feed).not.toContain("<script>");
  });
});

describe("hostile storage and feed inputs", () => {
  it("rejects tampering, future versions and noncanonical dates", async () => {
    const changed = structuredClone(first);
    changed.requests++;
    await expect(parseSnapshot(changed)).rejects.toThrow("hash mismatch");
    await expect(parseSnapshot({ ...first, version: 2 })).rejects.toThrow("version");
    await expect(parseSnapshot({ ...first, startedAt: "yesterday" })).rejects.toThrow("time");
    await expect(contentHash(JSON.parse('{"__proto__":{}}'))).rejects.toThrow("Unsafe");
    expect(() => validateValue("models", { data: [{ id: "x", "x-flop": { price_sources: [{}] } }] })).toThrow();
    expect(() => validateValue("stats", { stats: { latestBlockNumber: -1 } })).toThrow();
    expect(() => validateValue("models", { data: [] })).not.toThrow();
    await expect(
      seal({
        ...first,
        observations: { ...first.observations, health: { ...first.observations.health, value: "x".repeat(100_000) } },
      }),
    ).rejects.toThrow("100 KB");
  });
  it("rejects traversal, duplicate entries and nonfinite series values", () => {
    const entry = index.entries[0]!;
    expect(() => parseIndex({ version: 1, entries: [{ ...entry, path: "../../index.json" }] })).toThrow("path");
    expect(() => parseIndex({ version: 1, entries: [entry, entry] })).toThrow("Duplicate");
    expect(() => parseIndex({ version: 1, entries: [{ ...entry, fields: { bad: { value: NaN } } }] })).toThrow();
  });
  it("writes an idempotent content-addressed archive and validates it before append", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flop-recorder-test-"));
    try {
      expect((await readIndex(directory)).entries).toEqual([]);
      await storeSnapshot(directory, first);
      await storeSnapshot(directory, first);
      await storeSnapshot(directory, last);
      expect(await readIndex(directory)).toEqual(index);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("uses the fixed branch and handles absence, failures and hash mismatches", async () => {
    expect((await fetchHistory(async () => new Response("", { status: 404 }))).state).toBe("empty");
    expect((await fetchHistory(async () => new Response("bad", { status: 503 }))).state).toBe("unavailable");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(Response.json(last));
    const result = await fetchHistory(fetcher);
    expect(result.latestModels?.id).toBe(last.id);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const tampered = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(index))
      .mockResolvedValueOnce(Response.json(first));
    expect((await fetchHistory(tampered)).error).toContain("disagree");
  });
});
