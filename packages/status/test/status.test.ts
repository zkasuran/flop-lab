// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFixture } from "@flop-lab/fixtures";
import { describe, expect, it, vi } from "vitest";
import { appendRun } from "../src/archive";
import { analyzeHistory, uniqueRuns } from "../src/history";
import { probeServices, createMonitor, BODY_LIMIT } from "../src/probe";
import { recordings } from "../src/recorded";
import { parseHistory, parseRun, type Run } from "../src/schema";
import { SERVICES, checkContent } from "../src/services";

const recording = recordings[0]!;
async function replay(url: string | URL | Request) {
  const id = SERVICES.find((s) => s.url === String(url))!.id;
  const response = readFixture(`status-2026-11-06T05-23-46.400Z-${id}`);
  return new Response(response.body, {
    status: response.httpStatus,
    headers: { "Content-Type": response.contentType },
  });
}
function sample(hour: number, failed = false, observer = "test"): Run {
  const copy = structuredClone(recording);
  const time = new Date(Date.UTC(2026, 10, 6, hour)).toISOString();
  copy.observer = observer;
  copy.startedAt = time;
  copy.finishedAt = time;
  copy.probes.forEach((p) => {
    p.startedAt = time;
    p.measuredAt = time;
    if (failed) {
      p.outcome = "http-error";
      p.httpStatus = 503;
      p.detail = "synthetic failure";
    }
  });
  return copy;
}
const window = { from: "2026-11-06T00:00:00.000Z", to: "2026-11-07T00:00:00.000Z" };

describe("bounded probes", () => {
  it("replays the second recorded round without substituting its values", async () => {
    const expected = recordings[1]!;
    const run = await probeServices({
      fetch: async (url) => {
        const id = SERVICES.find((s) => s.url === String(url))!.id;
        const response = readFixture(`status-${expected.startedAt.replaceAll(":", "-")}-${id}`);
        return new Response(response.body, {
          status: response.httpStatus,
          headers: { "Content-Type": response.contentType },
        });
      },
    });
    expect(run.probes.map((p) => [p.outcome, p.bytes])).toEqual(expected.probes.map((p) => [p.outcome, p.bytes]));
  });
  it("replays the raw live responses through content validation and the shared MCP client", async () => {
    const calls: RequestInit[] = [];
    const run = await probeServices({
      fetch: async (url, init) => {
        calls.push(init!);
        return replay(url);
      },
    });
    expect(run.probes.map((p) => [p.service, p.outcome, p.httpStatus, p.bytes])).toEqual(
      recording.probes.map((p) => [p.service, p.outcome, p.httpStatus, p.bytes]),
    );
    expect(calls).toHaveLength(8);
    expect(calls.every((c) => c.redirect === "manual" && c.signal)).toBe(true);
    expect(calls.filter((c) => c.method === "POST").map((c) => JSON.parse(String(c.body)).method)).toEqual([
      "initialize",
      "initialize",
    ]);
  });
  it("rejects unrelated HTTP 200 pages, empty bodies and malformed JSON", async () => {
    for (const body of ["", "<html>maintenance</html>", "null", '{"data":[null]}']) {
      const run = await probeServices({
        fetch: async () => new Response(body, { headers: { "Content-Type": "application/json" } }),
      });
      expect(run.probes.every((p) => p.outcome === "content-error")).toBe(true);
    }
    expect(checkContent("gateway", '{"object":"list","data":[]}', "application/json")).toBe(true);
    expect(checkContent("gateway", '{"object":"list","data":[{"id":0}]}', "application/json")).toBe(false);
  });
  it("requires matching RPC ids, version and complete initialize information", async () => {
    for (const result of [
      null,
      {},
      { protocolVersion: "x", capabilities: {}, serverInfo: { name: "n", version: "v" } },
    ]) {
      const run = await probeServices({
        fetch: async () =>
          new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
            headers: { "Content-Type": "application/json" },
          }),
      });
      expect(run.probes.find((p) => p.service === "mcp")?.outcome).toBe("content-error");
    }
    const run = await probeServices({
      fetch: async (url) => {
        const response = await replay(url);
        return String(url).includes("/mcp")
          ? new Response((await response.text()).replace('"id":1', '"id":null'), { headers: response.headers })
          : response;
      },
    });
    expect(run.probes.find((p) => p.service === "mcp")?.outcome).toBe("content-error");
  });
  it("records 429 and 503 without retry or redirect and retains Retry-After", async () => {
    for (const status of [301, 429, 503]) {
      let count = 0;
      const run = await probeServices({
        fetch: async () => {
          count++;
          return new Response("no", { status, headers: { "Retry-After": "600", Location: "https://example.com" } });
        },
      });
      expect(count).toBe(8);
      expect(
        run.probes.every((p) => p.httpStatus === status && p.outcome === "http-error" && p.retryAfterMs === 600_000),
      ).toBe(true);
    }
  });
  it("bounds hanging fetches even when a transport ignores abort", async () => {
    const run = await probeServices({ timeoutMs: 10, fetch: async () => new Promise<Response>(() => {}) });
    expect(run.probes.every((p) => p.outcome === "timeout" && p.httpStatus === null)).toBe(true);
  });
  it("keeps the deadline through stalled response bodies", async () => {
    const run = await probeServices({
      timeoutMs: 10,
      fetch: async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
            },
          }),
        ),
    });
    expect(run.probes.every((p) => p.outcome === "timeout" && p.httpStatus === 200)).toBe(true);
  });
  it("caps bodies and distinguishes network errors", async () => {
    const large = await probeServices({ fetch: async () => new Response("x".repeat(BODY_LIMIT + 1)) });
    expect(large.probes.every((p) => p.outcome === "body-too-large")).toBe(true);
    const offline = await probeServices({
      fetch: async () => {
        throw new Error("offline");
      },
    });
    expect(offline.probes.every((p) => p.outcome === "network-error")).toBe(true);
  });
  it("coalesces callers, protects cached values and backs off failures", async () => {
    let now = 0;
    const fetchFn = vi.fn(async () => new Response("busy", { status: 503, headers: { "Retry-After": "900" } }));
    const monitor = createMonitor({ fetch: fetchFn, now: () => now });
    const [first, second] = await Promise.all([monitor(), monitor()]);
    expect(first).toEqual(second);
    first.probes.length = 0;
    now = 899_999;
    expect((await monitor()).probes).toHaveLength(8);
    expect(fetchFn).toHaveBeenCalledTimes(8);
    now = 900_000;
    await monitor();
    expect(fetchFn).toHaveBeenCalledTimes(16);
    now += 900_000;
    await monitor();
    expect(fetchFn).toHaveBeenCalledTimes(16); // Second failure doubles cooldown to 20 minutes.
  });
});

describe("measured history", () => {
  it("uses only measured samples and never calls an empty window available", () => {
    const rows = analyzeHistory([sample(0), sample(3, true), sample(6)], window);
    expect(rows[0]).toMatchObject({ samples: 3, passed: 2, availability: 2 / 3 });
    expect(analyzeHistory([], window).every((s) => s.availability === null && s.samples === 0)).toBe(true);
    expect(analyzeHistory([sample(0)], { from: window.to, to: window.to })[0]?.samples).toBe(0);
  });
  it("deduplicates capture ids and rejects conflicting copies", () => {
    const run = sample(0);
    expect(analyzeHistory([run, structuredClone(run)], window)[0]?.samples).toBe(1);
    const conflict = structuredClone(run);
    conflict.probes[0]!.latencyMs++;
    expect(() => uniqueRuns([run, conflict])).toThrow("Conflicting");
  });
  it("ends failure spans at observed recovery and breaks across missing rounds", () => {
    const row = analyzeHistory(
      [sample(0, true), sample(3, true), sample(6), sample(9, true), sample(18, true)],
      window,
    )[0]!;
    expect(row.incidents.map((i) => [i.failedSamples, i.endReason, i.recoveryObservedAt])).toEqual([
      [2, "recovered", sample(6).finishedAt],
      [1, "gap", null],
      [1, "end-of-window", null],
    ]);
  });
  it("does not use another observer to close a failed span", () => {
    const row = analyzeHistory([sample(0, true, "a"), sample(1, false, "b"), sample(3, true, "a")], window)[0]!;
    expect(row.incidents).toHaveLength(1);
    expect(row.incidents[0]).toMatchObject({ observer: "a", failedSamples: 2, recoveryObservedAt: null });
  });
  it("rejects hostile archive records and invalid windows", () => {
    for (const change of [
      { requests: 0 },
      { observer: "<script>" },
      { probes: [] },
      { finishedAt: "2026-99-99T00:00:00.000Z" },
    ])
      expect(() => parseRun({ ...recording, ...change })).toThrow();
    for (const change of [
      { source: "http://localhost" },
      { latencyMs: -1 },
      { latencyMs: Infinity },
      { httpStatus: null },
      { bytes: 0 },
    ]) {
      const run = structuredClone(recording);
      Object.assign(run.probes[0]!, change);
      expect(() => parseRun(run)).toThrow();
    }
    expect(() => parseHistory("null\n")).toThrow();
    expect(() => analyzeHistory([], { from: "bad", to: window.to })).toThrow();
    expect(parseHistory("\n")).toEqual([]);
  });
  it("appends failures to UTC day files, repairs a missing newline and keeps retries idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "flop-status-"));
    try {
      const a = sample(0),
        b = sample(3, true);
      const relative = await appendRun(root, a);
      expect(relative).toBe("status/2026/11/06.jsonl");
      await writeFile(join(root, relative), JSON.stringify(a));
      await appendRun(root, b);
      await appendRun(root, b);
      expect(parseHistory(await readFile(join(root, relative), "utf8"))).toHaveLength(2);
      expect(parseHistory(await readFile(join(root, "status/recent.jsonl"), "utf8"))[1]?.probes[0]?.outcome).toBe(
        "http-error",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
