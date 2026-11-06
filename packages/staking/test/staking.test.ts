// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  auditStake,
  commission,
  createObserver,
  decimal,
  formatFlop,
  minerStake,
  offences,
  parameters,
  parseParameters,
  recordedReport,
  recordedSnapshot,
  slashStake,
  unbonding,
} from "../src/index";
import catalog from "../fixtures/catalog.json";

describe("exact documented model", () => {
  it("includes base, window and surge in capacity exposure", () => {
    expect(minerStake("0", parameters).requiredFlop).toBe("10000");
    expect(minerStake("1", parameters).requiredFlop).toBe("17560");
    expect(minerStake("200", parameters).requiredFlop).toBe("1522000");
    expect(minerStake("0.000000000000000001", parameters).capacityBondFlop).toBe("0.00000000000000756");
    expect(
      minerStake("1", { ...parameters, coefficient: "0.000000000000000001", window: "1", surgePpm: "1" })
        .capacityBondFlop,
    ).toBe("0.000000000000000001");
  });
  it.each(["", "-1", "+1", "1e3", "NaN", "Infinity", "01", ".5", "1.", "1.0000000000000000001", "9".repeat(40)])(
    "rejects hostile decimal %s",
    (v) => expect(() => minerStake(v, parameters)).toThrow(),
  );
  it("rejects required-stake overflow", () =>
    expect(() => minerStake("100000000000000000000", parameters)).toThrow(/u128/));
  it("retains base-unit precision", () =>
    expect(formatFlop(decimal("9007199254740993.000000000000000001"))).toBe("9007199254740993.000000000000000001"));
  it("treats commission as a legacy ceiling with an inclusive boundary", () => {
    expect(commission("20", parameters)).toMatchObject({ withinLegacyCap: true, status: "legacy" });
    expect(commission("20.000000000000000001", parameters).withinLegacyCap).toBe(false);
    expect(() => commission("101", parameters)).toThrow();
  });
  it("keeps unbonding blocks distinct from assumed wall time", () => {
    expect(unbonding("miner", parameters).blocks).toBe("604800");
    expect(unbonding("validator", parameters).blocks).toBe("1814400");
    expect(unbonding("miner", parameters, "2").secondsAtTargetCadence).toBe("1209600");
  });
  it("fails closed on missing or changed catalog expressions", () => {
    expect(() => parseParameters({ ...catalog, raw: "{}" })).toThrow();
    expect(() => parseParameters({ ...catalog, raw: catalog.raw.replace("VFY / 100", "VFY / 10") })).toThrow();
    expect(() =>
      parseParameters({ ...catalog, raw: catalog.raw.replace("10_000 | FLOP", "10_000 | percent") }),
    ).toThrow();
  });
  it("uses quoted rules and leaves unknown severity unknown", () => {
    const offence = (id: string) => offences.find((o) => o.id === id)!;
    expect(slashStake("17560", offence("fraud"))).toMatchObject({
      lossMinFlop: "17560",
      lossMaxFlop: "17560",
      remainingMinFlop: "0",
    });
    expect(slashStake("17560", offence("liveness"))).toMatchObject({
      lossMinFlop: "175.6",
      lossMaxFlop: "878",
      remainingMinFlop: "16682",
    });
    expect(slashStake("1", offence("hard-attestation")).lossMaxFlop).toBe("1");
    expect(slashStake("100", offence("validator-downtime")).lossMaxFlop).toBe("5");
    expect(slashStake("1", offence("da-withholding")).lossMaxFlop).toBeNull();
    expect(slashStake("1", offence("dishonest-block")).status).toBe("rate unspecified");
    expect(slashStake("0.000000000000000001", offence("liveness"))).toMatchObject({
      lossMinFlop: "0",
      lossMaxFlop: "0.000000000000000001",
    });
  });
});

describe("recorded public evidence", () => {
  it("compares calibrated miner balances without claiming runtime proof", () => {
    const r = recordedReport();
    expect(r.errors).toEqual([]);
    const miner = r.miners.find((m) => m.capacityGflop === "200")!;
    expect(miner).toMatchObject({ selfFlop: "1522000", requiredFlop: "1522000", selfOnly: "MEETS MODEL" });
    expect(r.miners.some((m) => m.selfOnly === "UNVERIFIABLE")).toBe(true);
    expect(r.issue75.status).toBe("UNVERIFIABLE");
    expect(r.totals?.reportedEqualsSelf).toBe(true);
    expect(r.totals?.validatorFloorCheck).toBe("AT OR ABOVE BASELINE");
    expect(r.positions.some((p) => p.unbondingCheck === "MATCHES INDEXED INTERVAL")).toBe(true);
  });
  it("detects a one-base-unit deficit and never adds legacy delegated balance", () => {
    const data = JSON.parse(recordedSnapshot.miners.raw) as { data: Record<string, unknown>[] };
    const first = data.data[0]!;
    first.selfStake = "1521999999999999999999999";
    first.delegatedStake = "99999999999999999999999999";
    const r = auditStake(
      { ...recordedSnapshot, miners: { ...recordedSnapshot.miners, raw: JSON.stringify(data) } },
      parameters,
    );
    expect(r.miners[0]?.selfOnly).toBe("BELOW MODEL");
    expect(r.miners[0]?.withSponsored).toBe("MEETS MODEL");
  });
  it("returns explicit no data for empty or malformed boundaries", () => {
    const empty = { source: "https://mcp.flop.network/mcp", measuredAt: catalog.measuredAt, raw: "{}" };
    const r = auditStake({ miners: empty, positions: empty, stats: empty }, parameters);
    expect(r.errors).toHaveLength(3);
    expect(r.miners).toEqual([]);
    expect(r.totals).toBeNull();
    const clean = auditStake(
      {
        ...recordedSnapshot,
        miners: { ...empty, raw: '{"data":[],"pagination":{"offset":0,"total":0}}' },
        positions: { ...empty, raw: '{"sponsorPositions":[]}' },
      },
      parameters,
    );
    expect(clean.errors).toEqual([]);
    expect(clean.miners).toEqual([]);
    expect(clean.positions).toEqual([]);
  });
});

function replay(): typeof fetch {
  return async (input, init) => {
    if (String(input).includes("mcp.flop")) {
      const request = JSON.parse(String(init?.body)) as { id: number };
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: recordedSnapshot.positions.raw }] },
      });
    }
    return new Response(
      String(input).includes("/api/miners") ? recordedSnapshot.miners.raw : recordedSnapshot.stats.raw,
    );
  };
}
describe("bounded read-only observer", () => {
  it("replays real responses and reuses its cache", async () => {
    const observer = createObserver({ fetch: replay(), sleep: async () => {} });
    const first = await observer.run();
    const second = await observer.run();
    expect(first.errors).toEqual([]);
    expect(first.requests).toBe(3);
    expect(second.requests).toBe(0);
    expect(second.cached).toBe(true);
  });
  it("backs off once on 429 and 5xx without caching failures", async () => {
    const delays: number[] = [];
    const observer = createObserver({
      fetch: async () => new Response("offline", { status: 503 }),
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    const r = await observer.run();
    expect(r.requests).toBe(6);
    expect(r.errors).toHaveLength(3);
    expect(delays.some((d) => d >= 500)).toBe(true);
    expect((await observer.run()).cached).toBe(false);
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")(
    "optional live read",
    async (context) => {
      const r = await createObserver().run();
      if (r.errors.length) context.skip();
      expect(r.requests).toBeLessThanOrEqual(6);
      expect(r.sources.every((s) => s.source.startsWith("https://"))).toBe(true);
    },
    120_000,
  );
});
