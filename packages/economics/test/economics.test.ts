// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import {
  compare,
  EconomicsCollector,
  formatFlop,
  integer,
  parseFlop,
  parseObservation,
  paymentSplit,
  recordedObservation,
  rewardAt,
  rewardSplit,
  SPEC,
  subsidyAt,
  supplyAt,
  UNIT,
  QUERY,
} from "../src/index";
import specFixture from "../fixtures/spec.json";
import fixture from "../fixtures/devnet.json";

describe("exact pinned emission", () => {
  it("matches recorded parameter values rather than a remembered schedule", () => {
    const values = Object.fromEntries(specFixture.parameters.map((p) => [p.name, BigInt(p.value.replaceAll("_", ""))]));
    expect(SPEC.sha).toBe(specFixture.sha);
    expect(SPEC.genesis).toBe(values.genesis_supply! * UNIT);
    expect(SPEC.initialReward).toBe(values.initial_block_reward! * UNIT);
    expect(SPEC.halvingInterval).toBe(values.halving_interval_blocks);
    expect(SPEC.maxHalvings).toBe(values.max_halvings);
    expect(SPEC.floorReward).toBe(values.floor_reward! * UNIT);
    expect(SPEC.subsidyEnd).toBe(values.subsidy_duration_blocks);
    expect(SPEC.subsidyPerRecipient).toBe(values.subsidy_per_block_per_recipient! * UNIT);
    expect(Object.values(SPEC.rewardShares)).toEqual([
      values.miner_share_ppt,
      values.validator_share_ppt,
      values.agent_share_ppt,
      values.staker_share_ppt,
    ]);
    expect([SPEC.feeMinerPpt, SPEC.feeValidatorPpt, SPEC.auditPpm]).toEqual([
      values.inference_fee_miner_share_ppt,
      values.inference_fee_validator_share_ppt,
      values.audit_fee_split_ppm,
    ]);
  });
  it("does not reward genesis and includes both separate subsidies", () => {
    expect(rewardAt(0n)).toBe(0n);
    expect(subsidyAt(0n)).toBe(0n);
    expect(supplyAt(0n).gross).toBe(4_400_000_000n * UNIT);
    expect(supplyAt(1n).gross).toBe(4_400_000_112n * UNIT);
    expect(rewardSplit(1n)).toEqual({
      miners: 72n * UNIT,
      validators: parseFlop("9.6"),
      agents: parseFlop("9.6"),
      stakers: parseFlop("4.8"),
    });
  });
  it("prices every boundary on its own side, including fractional subsidy", () => {
    for (let e = 1n; e <= 5n; e++) {
      const b = e * 63_072_000n;
      expect(rewardAt(b - 1n)).toBe((96n * UNIT) / 2n ** (e - 1n));
      expect(rewardAt(b)).toBe((96n * UNIT) / 2n ** e);
      expect(supplyAt(b).gross - supplyAt(b - 1n).gross).toBe(rewardAt(b) + 2n * subsidyAt(b));
    }
    expect(subsidyAt(315_359_999n)).toBe(UNIT / 2n);
    expect(subsidyAt(315_360_000n)).toBe(0n);
    expect(rewardAt(10n ** 40n)).toBe(3n * UNIT);
  });
  it("reproduces the quoted cumulative totals and keeps the floor perpetual", () => {
    expect(supplyAt(378_431_999n).emission).toBe(11_920_607_904n * UNIT);
    expect(supplyAt(441_503_999n).emission).toBe(12_109_823_904n * UNIT);
    expect(supplyAt(315_360_000n).subsidy).toBe(1_955_231_984n * UNIT);
    expect(supplyAt(441_504_000n).emission - supplyAt(441_503_999n).emission).toBe(3n * UNIT);
  });
  it("agrees with a per-block sum for a short independent range", () => {
    let total = SPEC.genesis;
    for (let b = 1n; b <= 100n; b++) total += rewardAt(b) + 2n * subsidyAt(b);
    expect(supplyAt(100n).gross).toBe(total);
  });
});
describe("payment transfers", () => {
  it("takes the audit allocation from the full payment, inside the validator pool", () => {
    const p = paymentSplit(100n * UNIT, 2n * UNIT, 3n * UNIT);
    expect([p.miner, p.validators, p.audit, p.author, p.burned]).toEqual([85n * UNIT, 14n * UNIT, UNIT, 5n * UNIT, 0n]);
    expect(p.totalDebit).toBe(105n * UNIT);
  });
  it("never silently allocates unspecified dust or loses a unit", () => {
    for (const n of [0n, 1n, 7n, 99n, 1000n, 10n ** 70n + 13n]) {
      const p = paymentSplit(n);
      expect(p.miner + p.validators + p.audit + p.roundingDust).toBe(n);
      expect(p.roundingDust).toBeLessThanOrEqual(1n);
    }
    expect(paymentSplit(1n).roundingDust).toBe(1n);
  });
  it("rejects hostile numeric inputs and preserves base-unit precision", () => {
    for (const x of ["-1", "1e18", "1.0000000000000000001", "NaN", "", " 1", "01", "Infinity"])
      expect(() => parseFlop(x)).toThrow();
    for (const x of ["1.5", "-1", "1e2", "9".repeat(79)]) expect(() => integer(x)).toThrow();
    expect(formatFlop(parseFlop("9007199254740993.000000000000000001"))).toBe("9007199254740993.000000000000000001");
    expect(() => rewardAt(-1n)).toThrow();
    expect(() => supplyAt(-1n)).toThrow();
    expect(() => paymentSplit(1n, -1n)).toThrow();
  });
});
function modified(edit: (d: Record<string, unknown>) => void) {
  const d = JSON.parse(fixture.raw) as Record<string, unknown>;
  edit(d);
  return parseObservation({ ...fixture, raw: JSON.stringify(d) });
}
describe("dated chain comparison", () => {
  it("finds the recorded fee drift without calling unexposed receipts a match", () => {
    const report = compare(recordedObservation());
    const row = report.rows.find((r) => r.id.endsWith(":miner"))!;
    expect(row.status).toBe("DRIFT");
    expect(row.expected).toBe("850000000000000000");
    expect(row.observed).toBe("990000000000000000");
    expect(report.rows.find((r) => r.id === "supply")?.status).toBe("UNOBSERVABLE");
    expect(report.rows.filter((r) => r.id.endsWith(":burn")).every((r) => r.status === "MATCH")).toBe(true);
  });
  it("distinguishes exact agreement, drift, rounding and ineligible paths", () => {
    const o = recordedObservation();
    const r = o.data.settlements![0]!;
    r.minerPaid = "850000000000000000";
    expect(compare(o).rows.find((x) => x.id.endsWith(":miner"))?.status).toBe("MATCH");
    r.burned = "1";
    expect(compare(o).rows.find((x) => x.id.endsWith(":burn"))?.status).toBe("DRIFT");
    r.escrow = "1";
    r.minerPaid = "1";
    expect(compare(o).rows.find((x) => x.id.endsWith(":miner"))?.status).toBe("UNOBSERVABLE");
    r.cooperative = false;
    expect(compare(o).rows.find((x) => x.id.endsWith(":miner"))?.expected).toBeNull();
  });
  it("empty or absent observations produce no fabricated matches", () => {
    const o = modified((d) => {
      d.stats = null;
      d.networkValue = null;
      d.termCurve = null;
      d.settlementPrices = { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } };
    });
    const r = compare(o);
    expect(r.head).toBeNull();
    expect(r.counts.MATCH).toBe(0);
    expect(r.counts.DRIFT).toBe(0);
    expect(r.rows.every((x) => x.status === "UNOBSERVABLE")).toBe(true);
  });
  it("rejects malformed boundaries instead of coercing them", () => {
    for (const raw of ["null", "[]", "{}", '{"errors":[]}'])
      expect(() => parseObservation({ ...fixture, raw })).toThrow();
    expect(() => parseObservation({ ...fixture, measuredAt: "yesterday" })).toThrow();
    expect(() => parseObservation({ ...fixture, source: "https://other.example" })).toThrow();
    expect(() =>
      modified((d) => {
        d.stats = { latestBlockNumber: Number.MAX_SAFE_INTEGER + 1, totalBlocks: 1 };
      }),
    ).toThrow();
    expect(() =>
      modified((d) => {
        const c = d.settlementPrices as { data: { escrow: unknown }[] };
        c.data[0]!.escrow = 1e18;
      }),
    ).toThrow();
    expect(() =>
      modified((d) => {
        const c = d.settlementPrices as { data: unknown[] };
        c.data[1] = c.data[0];
      }),
    ).toThrow();
  });
  it("uses the shared client with one request per TTL and no caching on failure", async () => {
    let now = 0;
    const client = new McpClient();
    const call = vi.spyOn(client, "callTool").mockResolvedValue({
      value: JSON.parse(fixture.raw),
      raw: fixture.raw,
      measuredAt: fixture.measuredAt,
      durationMs: 1,
      attempts: 1,
    });
    const c = new EconomicsCollector(client, () => now);
    await c.collect();
    await c.collect();
    expect(call).toHaveBeenCalledTimes(1);
    now = 30_000;
    await c.collect();
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledWith("flop_indexer_query", { query: QUERY });
    now = 60_000;
    call.mockRejectedValueOnce(new Error("offline"));
    await expect(c.collect()).rejects.toThrow("offline");
    await c.collect();
    expect(call).toHaveBeenCalledTimes(4);
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")("can validate a fresh public observation", async () => {
    expect((await new EconomicsCollector().collect()).source).toBe("https://mcp.flop.network/mcp");
  });
});
