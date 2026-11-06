// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { accountWork, benchmark, decayWeight, leasePhase, renewal, uint } from "../src/model";
import { parameters as p, parseParameters, rules } from "../src/rules";
import { auditSnapshot } from "../src/observed";
import { recordedReport, recordedSnapshot } from "../src/recorded";
import { createObserver } from "../src/live";
import schema from "../fixtures/schema.json";

describe("reference-work accounting", () => {
  it("floors once across declared components", () => {
    expect(accountWork(["600000000", "600000000"])).toMatchObject({ gn: "1", remainder: "200000000" });
    expect(accountWork(["999999999"])).toMatchObject({ gn: "0", remainder: "999999999" });
    expect(accountWork(["1000000000"])).toMatchObject({ gn: "1", remainder: "0" });
  });
  it("checks destination widths without losing integer precision", () => {
    const max = (1n << 64n) - 1n;
    expect(accountWork([(max * 1_000_000_000n).toString()], 64).gn).toBe(max.toString());
    expect(() => accountWork([((max + 1n) * 1_000_000_000n).toString()], 64)).toThrow("u64");
    expect(() => accountWork([((1n << 128n) * 1_000_000_000n).toString()])).toThrow("u128");
  });
  it.each(["", "-1", "1.1", "1e9", " 1", "01", "9".repeat(81), NaN, 1])("rejects hostile input %s", (value) =>
    expect(() => uint(value)).toThrow(),
  );
  it("rejects an unspecified or oversized component set", () => {
    expect(() => accountWork([])).toThrow();
    expect(() => accountWork(Array<string>(65).fill("0"))).toThrow();
  });
  it("uses period-relative decay, caps the exponent and floors only once", () => {
    expect(decayWeight("3", "900000000", "2").weightedGn).toBe("2");
    expect(decayWeight("123456789", p.decayPpb, "999999999999").weightedGn).toBe("123456789");
    expect(decayWeight("1000", "990000000", "101")).toEqual(decayWeight("1000", "990000000", "100"));
    expect(decayWeight("10", "0", "0").weightedGn).toBe("10");
    expect(decayWeight("10", "0", "1").weightedGn).toBe("0");
    expect(() => decayWeight("1", "1000000001", "1")).toThrow();
  });
});
describe("pinned calibration rules", () => {
  const burst = { empirical: "213", blocks: "600", jobs: "64", verifiedGn: "64000", tier: "SOFT" as const };
  it("matches the paper's worked calibration example", () => {
    expect(rules[1]!.quote).toContain("63,900");
    expect(benchmark(burst, p)).toMatchObject({ requiredGn: "63900", effectiveCap: "213", arithmeticPass: true });
    for (const change of [{ verifiedGn: "63899" }, { jobs: "63" }, { blocks: "599" }, { empirical: "0" }])
      expect(benchmark({ ...burst, ...change }, p).arithmeticPass).toBe(false);
  });
  it("uses the empirical cap for the work gate and discounts only HARD ceilings", () => {
    expect(benchmark({ ...burst, tier: "HARD", ceiling: "200" }, p)).toMatchObject({
      effectiveCap: "180",
      requiredGn: "63900",
    });
    expect(benchmark({ ...burst, tier: "HARD", ceiling: "201" }, p).effectiveCap).toBe("180");
    expect(() => benchmark({ ...burst, tier: "HARD" }, p)).toThrow();
  });
  it("fails closed at exact expiry and distinguishes grace from service", () => {
    expect(leasePhase("1000", "999", p).phase).toBe("Before acceptance");
    expect(leasePhase("1000", "519399", p).phase).toBe("Active");
    expect(leasePhase("1000", "519400", p).phase).toBe("Active: renewal due");
    expect(leasePhase("1000", "605799", p).serviceEligibleByTime).toBe(true);
    expect(leasePhase("1000", "605800", p)).toMatchObject({
      phase: "Expired: renewal grace",
      serviceEligibleByTime: false,
    });
    expect(leasePhase("1000", "1210600", p).phase).toBe("Expired: prunable");
  });
  it("requires fresh renewal work and forbids effective and empirical cap increases", () => {
    const r = {
      current: "1200",
      trigger: "1100",
      cap: "200",
      nextCap: "180",
      empirical: "213",
      nextEmpirical: "213",
      jobs: "8",
      verifiedGn: "10000",
    };
    expect(renewal(r, p)).toMatchObject({ arithmeticPass: true, requiredGn: "10000" });
    for (const change of [
      { jobs: "7" },
      { verifiedGn: "9999" },
      { trigger: "599" },
      { nextCap: "201" },
      { nextEmpirical: "214" },
    ])
      expect(renewal({ ...r, ...change }, p).arithmeticPass).toBe(false);
    expect(renewal({ ...r, trigger: "1200" }, p).requiredGn).toBe("100");
    expect(() => renewal({ ...r, trigger: "1201" }, p)).toThrow("future");
  });
  it("reads quoted defaults and refuses missing or duplicate definitions", () => {
    expect(p).toMatchObject({ lease: "604800", decayPpb: "1000000000", minJobs: "64" });
    expect(() => parseParameters("")).toThrow();
    expect(() => parseParameters(rules[2]!.quote + rules[2]!.quote)).toThrow();
  });
});
describe("real observations and unavailable evidence", () => {
  it("checks the recorded fields without turning Active into lease proof", () => {
    const report = recordedReport();
    expect(report.errors).toEqual([]);
    expect(report.miners).toHaveLength(70);
    expect(report.miners.filter((m) => m.gnMax !== null)).toHaveLength(63);
    expect(report.miners.every((m) => m.leaseStatus === "UNOBSERVABLE")).toBe(true);
    expect(report.miners.filter((m) => m.gnMax !== null).every((m) => m.baselineCheck === "MATCH")).toBe(true);
    expect(JSON.parse(schema.raw).__schema.queryType.fields.map((f: { name: string }) => f.name)).not.toContain(
      "calibrations",
    );
  });
  it("detects a baseline mismatch and rejects unsafe integers and duplicate rows", () => {
    const raw = JSON.parse(recordedSnapshot.miners.raw!);
    raw.data[0].calibration.pledgeBaseline++;
    const read = () =>
      auditSnapshot({ ...recordedSnapshot, miners: { ...recordedSnapshot.miners, raw: JSON.stringify(raw) } });
    expect(read().miners[0]!.baselineCheck).toBe("DRIFT");
    raw.data[0].calibration.gnMax = Number.MAX_SAFE_INTEGER + 1;
    expect(read().errors).toHaveLength(1);
    expect(read().miners).toEqual([]);
    raw.data[0] = raw.data[1];
    expect(read().errors[0]).toContain("Duplicate");
  });
  it("handles empty and unavailable data without invented counts", () => {
    const empty = auditSnapshot({
      ...recordedSnapshot,
      miners: {
        ...recordedSnapshot.miners,
        raw: JSON.stringify({ data: [], pagination: { total: 0, offset: 0, hasMore: false } }),
      },
    });
    expect(empty.miners).toEqual([]);
    expect(empty.complete).toBe(true);
    const offline = auditSnapshot({
      miners: { ...recordedSnapshot.miners, raw: null },
      stats: { ...recordedSnapshot.stats, raw: null },
    });
    expect(offline.head).toBeNull();
    expect(offline.errors).toHaveLength(2);
  });
  it("replays real responses, caches successful reads and honors TTL", async () => {
    let clock = Date.parse("2026-11-06T01:00:00Z"),
      calls = 0;
    const mock: typeof fetch = async (url, init) => {
      calls++;
      if (String(url).includes("explorer")) return new Response(recordedSnapshot.miners.raw);
      const body = JSON.parse(String(init!.body));
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: recordedSnapshot.stats.raw }] },
      });
    };
    const observer = createObserver({
      fetch: mock,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect((await observer.run()).requests).toBe(2);
    expect((await observer.run()).requests).toBe(0);
    expect(calls).toBe(2);
    clock += 30_001;
    expect((await observer.run()).requests).toBe(2);
  });
  it("bounds transient failures, retries with backoff and returns no-data", async () => {
    const waits: number[] = [];
    const observer = createObserver({
      fetch: async () => new Response("busy", { status: 503 }),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const report = await observer.run();
    expect(report.requests).toBe(4);
    expect(report.errors).toHaveLength(2);
    expect(waits.some((n) => n >= 500)).toBe(true);
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")(
    "optional bounded public read",
    async () => {
      const r = await createObserver().run();
      expect(r.requests).toBeLessThanOrEqual(4);
      if (!r.errors.length) expect(r.head).not.toBeNull();
    },
    60000,
  );
});
