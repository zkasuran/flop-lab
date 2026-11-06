// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import raw from "./fixtures/2026-11-06T04-45-55.439Z.json";
import harness from "../../harness/last-run.json";
import { parseConfig, parseRules, rulesYaml, example, type Config, type Rule } from "../src/config";
import { evaluate, replay } from "../src/engine";
import { parseSample, settlementPage, channels, type Sample, type Observation } from "../src/observations";
import { openWatcher, deliveryId } from "../src/runtime";
import { createCollector } from "../src/collect";

const sample = parseSample(raw);
const config = (...rules: Rule[]): Config => parseConfig({ ...example, rules });
const reset = config({ id: "reset", kind: "devnet-reset" });
function at(offset: number, key: Observation["key"], change: (value: Record<string, unknown>) => void): Sample {
  const copy = structuredClone(sample),
    stamp = new Date(Date.parse(sample.finishedAt) + offset).toISOString();
  copy.startedAt = stamp;
  copy.finishedAt = stamp;
  copy.observations.forEach((o) => {
    o.measuredAt = stamp;
  });
  const o = copy.observations.find((o) => o.key === key)!;
  const body = JSON.parse(o.raw!) as Record<string, unknown>;
  change(body);
  o.raw = JSON.stringify(body);
  return copy;
}
function height(offset: number, value: number) {
  return at(offset, "stats", (o) => {
    (o.stats as Record<string, unknown>).latestBlockNumber = value;
  });
}
const directories: string[] = [];
async function statePath() {
  const dir = await mkdtemp(join(tmpdir(), "flop-watch-test-"));
  directories.push(dir);
  return join(dir, "state.json");
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("strict rules and recorded boundaries", () => {
  it("round trips YAML and rejects unknown keys, aliases, duplicate IDs and hostile values", () => {
    expect(parseRules(rulesYaml(example))).toEqual(example);
    expect(() => parseRules("version: 1\nversion: 1")).toThrow();
    expect(() => parseRules("rules: &rules [*rules]")).toThrow();
    expect(() => parseConfig({ ...example, pollMS: 500 })).toThrow("Unknown field");
    expect(() => parseConfig({ ...example, rules: [example.rules[0], example.rules[0]] })).toThrow("Duplicate");
    expect(() => parseConfig({ ...example, pollMs: NaN })).toThrow();
    expect(() => parseConfig({ ...example, outputs: [{ kind: "webhook", url: "file:///tmp/test" }] })).toThrow();
    expect(() => config({ id: "constructor", kind: "devnet-reset" })).toThrow();
  });
  it("validates real recordings and fails malformed successes instead of inferring zero", () => {
    expect(sample.observations.every((o) => o.status === "ok")).toBe(true);
    expect(sample.requests).toBe(4);
    const bad = structuredClone(sample);
    bad.observations[0]!.raw = "{}";
    expect(() => parseSample(bad)).toThrow();
    expect(() => parseSample({ ...sample, observations: [sample.observations[0], sample.observations[0]] })).toThrow(
      "Duplicate",
    );
    expect(() => parseSample({ ...sample, finishedAt: "2020-01-01T00:00:00.000Z" })).toThrow();
    expect(evaluate(reset, { ...sample, observations: [] }).alerts).toEqual([]);
  });
});
describe("alert decisions", () => {
  it("compares observed heights, skips stale reads and keeps missing values out of the reset signal", () => {
    const baseline = evaluate(reset, height(0, 100));
    expect(baseline.alerts).toEqual([]);
    const decreased = evaluate(reset, height(1000, 99), baseline.state);
    expect(decreased.alerts).toHaveLength(1);
    expect(decreased.alerts[0]?.evidence).toEqual({ before: 100, after: 99 });
    expect(evaluate(reset, height(1000, 99), decreased.state).alerts).toEqual([]);
    expect(evaluate(reset, height(0, 50), decreased.state).alerts).toEqual([]);
    expect(evaluate(reset, height(1000, 101), baseline.state).alerts).toEqual([]);
    const missing = height(500, 1);
    missing.observations[0] = { ...missing.observations[0]!, status: "unknown", raw: null, error: "Missing stats" };
    expect(evaluate(reset, missing, baseline.state).state.reset?.values.height).toBe(100);
  });
  it("baselines existing settlements and detects only the watched address without replay duplicates", () => {
    const first = settlementPage(sample.observations.find((o) => o.key === "settlements")!.raw!).rows[0]!;
    const c = config({ id: "settled", kind: "settlement", address: first.agent });
    const baseline = evaluate(c, sample);
    expect(baseline.alerts).toEqual([]);
    expect(baseline.notes.join(" ")).toContain("partial");
    const later = at(1000, "settlements", (o) => {
      (o.data as Record<string, unknown>[])[0]!.settledBlock = first.settledBlock + 1;
    });
    const result = evaluate(c, later, baseline.state);
    expect(result.alerts).toHaveLength(1);
    expect(evaluate(c, later, result.state).alerts).toEqual([]);
    expect(
      evaluate(config({ id: "other", kind: "settlement", address: "1".repeat(48) }), later, baseline.state).alerts,
    ).toEqual([]);
  });
  it("uses the exact expiry boundary and never expires a missing quote", () => {
    const c = config({ id: "prices", kind: "price-expired" });
    const sourceSample = at(1000, "models", (o) => {
      const m = (o.data as Record<string, unknown>[])[0]!;
      (m["x-flop"] as Record<string, unknown>).price_sources = [
        {
          ...((m["x-flop"] as Record<string, unknown>).price_sources as Record<string, unknown>[])[0]!,
          expires_at: new Date(Date.parse(sample.finishedAt) + 1000).toISOString(),
        },
      ];
    });
    const result = evaluate(c, sourceSample);
    expect(result.alerts).toHaveLength(1);
    expect(evaluate(c, sourceSample, result.state).alerts).toEqual([]);
    expect(
      evaluate(
        c,
        at(1000, "models", (o) => {
          o.data = [];
        }),
      ).alerts,
    ).toEqual([]);
  });
  it("requires explicit forced state and positive remaining blocks at the threshold", () => {
    const c = config({ id: "closing", kind: "challenge-closing", withinBlocks: 10 });
    const synthetic = at(1000, "channels", (o) => {
      const page = o.computeChannels as { data: Record<string, unknown>[] };
      page.data = [
        {
          ...page.data[0],
          status: "ForceSettled",
          cooperative: false,
          challengeEnd: 110,
          finalRoot: `0x${"1".repeat(64)}`,
          settlement: null,
        },
      ];
    });
    const stats = synthetic.observations.find((o) => o.key === "stats")!;
    const body = JSON.parse(stats.raw!) as { stats: { latestBlockNumber: number } };
    body.stats.latestBlockNumber = 100;
    stats.raw = JSON.stringify(body);
    expect(channels(synthetic.observations.find((o) => o.key === "channels")!.raw!).data).toHaveLength(1);
    expect(evaluate(c, synthetic).alerts[0]?.evidence.remainingBlocks).toBe(10);
    body.stats.latestBlockNumber = 110;
    stats.raw = JSON.stringify(body);
    expect(evaluate(c, synthetic).alerts).toEqual([]);
    body.stats.latestBlockNumber = 99;
    stats.raw = JSON.stringify(body);
    expect(evaluate(c, synthetic).alerts).toEqual([]);
  });
  it("reads validated harness reports and requires a newer report for claim transitions", () => {
    const report = structuredClone(harness),
      claim = report.results[0]!.claim.id;
    const c = config({ id: "claim", kind: "claim-change", report: "report.json", claim });
    const poll = (raw: unknown, t: number): Sample => {
      const s = height(t, 100);
      s.observations = [
        {
          key: "harness:report.json",
          source: "file:///report.json",
          measuredAt: s.finishedAt,
          status: "ok",
          raw: JSON.stringify(raw),
          error: null,
        },
      ];
      return s;
    };
    const baseline = evaluate(c, poll(report, 0));
    report.results[0]!.status = report.results[0]!.status === "PASS" ? "FAIL" : "PASS";
    expect(evaluate(c, poll(report, 1000), baseline.state).alerts).toEqual([]);
    report.measuredAt = new Date(Date.parse(report.measuredAt) + 1000).toISOString();
    expect(evaluate(c, poll(report, 2000), baseline.state).alerts).toHaveLength(1);
  });
  it("counts consecutive failed probes, re-arms after recovery and excludes budget exhaustion", () => {
    const c = config({ id: "down", kind: "service-down", service: "mcp", failures: 2 });
    const probe = (i: number, status: Observation["status"]) => {
      const s = height(i * 1000, 100);
      s.observations[0] = {
        ...s.observations[0]!,
        status,
        raw: status === "ok" ? s.observations[0]!.raw : null,
        error: status === "ok" ? null : "probe",
      };
      return s;
    };
    const results = replay(c, [
      probe(0, "down"),
      probe(1, "down"),
      probe(2, "down"),
      probe(3, "ok"),
      probe(4, "down"),
      probe(5, "budget"),
      probe(6, "down"),
      probe(7, "down"),
    ]);
    expect(results.map((r) => r.alerts.length)).toEqual([0, 1, 0, 0, 0, 0, 0, 1]);
  });
});
describe("durable output and budgets", () => {
  it("persists before output, drains after restart and does not repeat acknowledged alerts", async () => {
    const path = await statePath(),
      lines: string[] = [],
      stdout = async (line: string) => {
        lines.push(line);
      };
    const a = await openWatcher(path, reset, { stdout });
    await expect(openWatcher(path, reset)).rejects.toMatchObject({ code: "EEXIST" });
    await a.accept(height(0, 100));
    await a.accept(height(1000, 99));
    expect(lines).toHaveLength(0);
    await a.close();
    const b = await openWatcher(path, reset, { stdout });
    await b.flush();
    await b.accept(height(1000, 99));
    await b.flush();
    await b.close();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).evidence).toEqual({ before: 100, after: 99 });
    const c = await openWatcher(path, reset, { stdout });
    await c.flush();
    await c.close();
    expect(lines).toHaveLength(1);
  });
  it("persists webhook retries, honors Retry-After and dead-letters the terminal failure", async () => {
    const path = await statePath();
    let now = Date.now();
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("busy", { status: 503, headers: { "retry-after": "10" } }),
    );
    const c = { ...reset, outputs: [{ kind: "webhook" as const, url: "https://example.test/hook" }] };
    const a = await openWatcher(path, c, { fetch: fetcher, now: () => now });
    await a.accept(height(0, 100));
    const result = await a.accept(height(1000, 99));
    await a.flush();
    await a.flush();
    await a.close();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("idempotency-key")).toBe(deliveryId(result.alerts[0]!));
    const b = await openWatcher(path, c, { fetch: fetcher, now: () => now });
    now += 10_000;
    await b.flush();
    now += 10_000;
    await b.flush();
    await b.close();
    expect(fetcher).toHaveBeenCalledTimes(3);
    const dead = JSON.parse(await readFile(`${path}.dead-letter.jsonl`, "utf8"));
    expect(dead.attempts).toBe(3);
    expect(dead.error).toBe("Webhook HTTP 503");
    const d = await openWatcher(path, c, { fetch: fetcher });
    await d.flush();
    await d.close();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("sends a real local webhook POST and does not follow redirects", async () => {
    const requests: { method: string | undefined; body: string }[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += String(chunk);
      requests.push({ method: req.method, body });
      res.writeHead(204);
      res.end();
    });
    server.listen(3749, "127.0.0.1");
    await once(server, "listening");
    try {
      const path = await statePath(),
        c = { ...reset, outputs: [{ kind: "webhook" as const, url: "http://127.0.0.1:3749/hook" }] };
      const a = await openWatcher(path, c);
      await a.accept(height(0, 100));
      await a.accept(height(1000, 99));
      await a.flush();
      await a.close();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(JSON.parse(requests[0]!.body).kind).toBe("devnet-reset");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
  it("records desktop unavailability and refuses corrupt state instead of resetting it", async () => {
    const path = await statePath();
    const a = await openWatcher(
      path,
      { ...reset, outputs: [{ kind: "desktop" }] },
      {
        desktop: async () => {
          throw new Error("Unavailable");
        },
      },
    );
    await a.accept(height(0, 100));
    await a.accept(height(1000, 99));
    await a.flush();
    await a.close();
    expect(await readFile(`${path}.dead-letter.jsonl`, "utf8")).toContain("Unavailable");
    await writeFile(path, "{}");
    await expect(openWatcher(path, reset)).rejects.toThrow("state version");
  });
  it("counts physical retries in a hard budget, caches polls and avoids alerting budget as downtime", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("down", { status: 503 }));
    const c = createCollector({ ...reset, maxRequests: 1 }, { fetch: fetcher, sleep: async () => undefined });
    const a = await c.collect(),
      b = await c.collect();
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(c.transport.requests).toBe(1);
    expect(a.observations[0]?.status).toBe("down");
  });
});
