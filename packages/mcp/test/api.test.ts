// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { McpClient } from "../src/client";
import { replayFetch } from "../src/fixtures";
import { escrowConserved, getStats, listSessionOffers, listSettlements, parseSettlement, parseStats } from "../src/api";

const client = () => new McpClient({ fetch: replayFetch(), sleep: async () => {}, minIntervalMs: 0 });

describe("typed helpers on recorded answers", () => {
  it("parses network stats", async () => {
    const s = (await getStats(client())).value;
    expect(s.latestBlockNumber).toBeGreaterThan(2_000_000);
    expect(s.flopLocked).toMatch(/^\d+$/);
  });
  it("parses a settlement page and the arithmetic holds for every row", async () => {
    const page = (await listSettlements(client(), { limit: 5 })).value;
    expect(page.data).toHaveLength(5);
    expect(page.total).toBeGreaterThan(5);
    for (const s of page.data) expect(escrowConserved(s)).toBe(true);
  });
  it("parses an empty offer list", async () => {
    const p = (await listSessionOffers(client())).value;
    expect(p.data).toEqual([]);
    expect(p.hasMore).toBe(false);
  });
});

describe("validation at the boundary", () => {
  it("rejects a settlement whose amount is not an integer string", () => {
    const row = {
      channelId: "0x1",
      settledBlock: 1,
      settledAt: 1,
      agent: "a",
      miner: "m",
      escrow: "1.5",
      minerPaid: "1",
      burned: "0",
      unusedEscrow: "0",
      aggregateGn: "1",
      pricePerGflop: "1",
      cooperative: true,
      settlementKind: "settled",
      settlementEvent: "e",
      marketKind: "spot",
    };
    expect(() => parseSettlement(row)).toThrow(/escrow is not an integer string/);
  });
  it("rejects stats with a missing field", () => {
    expect(() => parseStats({ stats: { latestBlockNumber: 1 } })).toThrow(/stats\./);
  });
  it("detects broken conservation", () => {
    expect(escrowConserved({ escrow: "10", minerPaid: "9", unusedEscrow: "1", burned: "0" })).toBe(true);
    expect(escrowConserved({ escrow: "10", minerPaid: "9", unusedEscrow: "2", burned: "0" })).toBe(false);
  });
});

describe.skipIf(!process.env.FLOP_LIVE)("live server", () => {
  it("returns stats", async () => {
    const live = new McpClient();
    expect((await getStats(live)).value.totalAccounts).toBeGreaterThan(0);
  });
});
