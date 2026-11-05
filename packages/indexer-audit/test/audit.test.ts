// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditSnapshot, formatReport, parseSnapshot } from "../src/index";
import type { Snapshot } from "../src/index";

const fixture = parseSnapshot(JSON.parse(readFileSync(new URL("../fixtures/devnet.json", import.meta.url), "utf8")));
function altered(id: string, change: (value: Record<string, unknown>) => void): Snapshot {
  const s = structuredClone(fixture);
  const observation = s.observations.find((o) => o.id === id)!;
  const value = JSON.parse(observation.raw!) as Record<string, unknown>;
  change(value);
  observation.raw = JSON.stringify(value);
  return s;
}
function finding(s: Snapshot, id: string) {
  return auditSnapshot(s).findings.find((f) => f.id === id)!;
}
function settlements(root: Record<string, unknown>) {
  return (root.settlementPrices as { data: Record<string, unknown>[] }).data;
}

describe("recorded devnet audit", () => {
  it("replays the real discrepancy and exact settlement arithmetic", () => {
    expect(finding(fixture, "stake-miners")).toMatchObject({
      status: "FAIL",
      left: { value: "3260130000000000000000000" },
      right: { value: "63427153000000000000000000" },
    });
    for (const id of [
      "block-order",
      "block-lookup",
      "finality-lag",
      "stake-validators",
      "escrow-0",
      "price-0",
      "channel-0",
    ])
      expect(finding(fixture, id).status).toBe("PASS");
    for (const id of [
      "calibration-window",
      "runtime-stake",
      "supply",
      "inference-totals",
      "leaderboard",
      "miner-sum-selfStake",
    ])
      expect(finding(fixture, id).status).toBe("UNVERIFIABLE");
  });
  it("detects a one-planck loss above Number.MAX_SAFE_INTEGER", () => {
    const s = altered("indexer", (root) => {
      const row = settlements(root)[0]!;
      row.escrow = (BigInt(String(row.escrow)) + 1n).toString();
    });
    expect(finding(s, "escrow-0").status).toBe("FAIL");
  });
  it("catches channel divergence and a changed unit price", () => {
    const s = altered("channel-0", (c) => {
      c.minerPaid = "1";
    });
    expect(finding(s, "channel-0").status).toBe("FAIL");
    expect(finding(s, "price-0").status).toBe("FAIL");
  });
  it("does not compare price against another settlement revision", () => {
    const s = altered("channel-0", (c) => {
      (c.settlement as Record<string, unknown>).blockHash = "0xother";
    });
    expect(finding(s, "channel-0").status).toBe("UNVERIFIABLE");
    expect(finding(s, "price-0").status).toBe("UNVERIFIABLE");
  });
  it.each([null, "-1", "1e18", Number("1374000000000000111"), "NaN", "9".repeat(79)])(
    "rejects hostile monetary values %s",
    (value) => {
      const s = altered("indexer", (root) => {
        settlements(root)[0]!.escrow = value;
      });
      expect(finding(s, "escrow-0").status).toBe("UNVERIFIABLE");
    },
  );
  it("keeps zero compute and malformed decimals unverifiable", () => {
    expect(
      finding(
        altered("channel-0", (c) => {
          c.aggregateGn = "0";
        }),
        "price-0",
      ).status,
    ).toBe("UNVERIFIABLE");
    expect(
      finding(
        altered("indexer", (r) => {
          settlements(r)[0]!.pricePerGflop = "1e-5";
        }),
        "price-0",
      ).status,
    ).toBe("UNVERIFIABLE");
  });
  it("uses the last printed decimal place as a bound, not a float tolerance", () => {
    const s = altered("indexer", (root) => {
      settlements(root)[0]!.pricePerGflop = "6480000000000000.818181818181818182";
    });
    expect(finding(s, "price-0").status).toBe("PASS");
    const t = altered("indexer", (root) => {
      settlements(root)[0]!.pricePerGflop = "6480000000000000.818181818181818183";
    });
    expect(finding(t, "price-0").status).toBe("FAIL");
  });
  it("catches counter regression but treats different peer heights as unverifiable", () => {
    expect(
      finding(
        altered("counters-after", (r) => {
          (r.stats as Record<string, unknown>).totalTransactions = 0;
        }),
        "monotonic-totalTransactions",
      ).status,
    ).toBe("FAIL");
    expect(
      finding(
        altered("stats", (r) => {
          (r.stats as Record<string, unknown>).latestBlockNumber = 0;
        }),
        "stats-stats",
      ).status,
    ).toBe("UNVERIFIABLE");
  });
  it("detects a broken parent link", () => {
    const s = altered("indexer", (r) => {
      (r.blocks as Record<string, unknown>[])[0]!.parentHash = "wrong";
    });
    expect(finding(s, "block-order").status).toBe("FAIL");
  });
  it("allows tied leaderboard weights and rejects reversed order or duplicate miners", () => {
    const board = (weights: number[]) =>
      altered("indexer", (r) => {
        r.pouiLeaderboard = weights.map((totalWeight, i) => ({ submitter: `miner-${i}`, totalWeight, proofsCount: 1 }));
      });
    expect(finding(board([4, 4, 1]), "leaderboard").status).toBe("PASS");
    expect(finding(board([1, 4, 4]), "leaderboard").status).toBe("FAIL");
    expect(
      finding(
        altered("indexer", (r) => {
          r.pouiLeaderboard = [
            { submitter: "m", totalWeight: 4 },
            { submitter: "m", totalWeight: 1 },
          ];
        }),
        "leaderboard",
      ).status,
    ).toBe("FAIL");
  });
  it("never treats empty, offline or GraphQL error data as success", () => {
    const s = structuredClone(fixture);
    s.observations = [];
    expect(auditSnapshot(s).counts.PASS).toBe(0);
    const broken = altered("indexer", (r) => {
      r.errors = [{ message: "offline" }];
    });
    expect(finding(broken, "block-order").status).toBe("UNVERIFIABLE");
    const empty = altered("indexer", (r) => {
      r.blocks = [];
      r.settlementPrices = { data: [] };
    });
    expect(finding(empty, "block-order").status).toBe("UNVERIFIABLE");
    expect(finding(empty, "settlements").status).toBe("UNVERIFIABLE");
  });
  it("only sums complete lists with unique keys", () => {
    const complete = altered("miners", (r) => {
      (r.pagination as Record<string, unknown>).hasMore = false;
      (r.pagination as Record<string, unknown>).total = 3;
    });
    expect(finding(complete, "miner-sum-selfStake").status).toBe("FAIL");
    const duplicate = altered("miners", (r) => {
      const data = r.data as Record<string, unknown>[];
      data[1]!.address = data[0]!.address;
      r.pagination = { hasMore: false, total: 3, offset: 0, limit: 3 };
    });
    expect(finding(duplicate, "miner-sum-selfStake").status).toBe("UNVERIFIABLE");
  });
  it("validates snapshot dates, ids and raw payload sizes", () => {
    expect(() => auditSnapshot({ ...fixture, startedAt: "bad date" })).toThrow();
    expect(() =>
      auditSnapshot({ ...fixture, observations: [fixture.observations[0], fixture.observations[0]] }),
    ).toThrow();
    const s = structuredClone(fixture);
    s.observations[0]!.raw = "x".repeat(200001);
    expect(() => auditSnapshot(s)).toThrow();
  });
  it("prints source dates and both sides of a failure", () => {
    const out = formatReport(auditSnapshot(fixture));
    expect(out).toContain("3260130000000000000000000");
    expect(out).toContain("63427153000000000000000000");
    expect(out).toContain(fixture.completedAt);
    expect(out).toContain("https://explorer.devnet.flop.network/api/staking/stats");
  });
});
