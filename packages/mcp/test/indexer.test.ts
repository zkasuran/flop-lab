// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { McpClient, parseIndexerData, readIndexer, type IndexerEntity } from "../src/index";

function fixture(entity: string): { raw: string; measuredAt: string; source: string } {
  return JSON.parse(readFileSync(new URL(`../fixtures/indexer-${entity}.json`, import.meta.url), "utf8"));
}
describe("introspected indexer selections", () => {
  it.each([
    "blocks",
    "transactions",
    "htlcs",
    "computeChannels",
    "settlementPrices",
    "pouiProofs",
    "reliabilityEvents",
    "sponsorPositions",
    "block",
    "transaction",
    "account",
    "computeChannel",
    "settlementPrice",
    "htlc",
    "minerReliability",
    "inferenceSpend",
    "inferenceReceived",
    "htlcPaid",
    "htlcReceived",
  ] as const)("validates recorded %s", (entity) => {
    const f = fixture(entity);
    expect(Date.parse(f.measuredAt)).not.toBeNaN();
    expect(f.source).toBe("https://mcp.flop.network/mcp");
    expect(parseIndexerData(entity, JSON.parse(f.raw))).toBeDefined();
  });
  it("rejects missing, partial and hostile data", () => {
    for (const value of [null, [], {}, { blocks: null }, { blocks: [null] }, { errors: [], blocks: [] }])
      expect(() => parseIndexerData("blocks", value)).toThrow();
    const root = JSON.parse(fixture("blocks").raw) as { blocks: Record<string, unknown>[] };
    root.blocks[0]!.number = "123";
    expect(() => parseIndexerData("blocks", root)).toThrow();
  });
  it("keeps null lookups and empty lists distinct", () => {
    expect(parseIndexerData("block", { block: null })).toBeNull();
    expect(parseIndexerData("blocks", { blocks: [] })).toEqual([]);
    expect(parseIndexerData("pouiProofs", JSON.parse(fixture("pouiProofs").raw))).toEqual([]);
  });
  it("does not round or coerce amount strings", () => {
    const root = JSON.parse(fixture("computeChannels").raw) as { computeChannels: { data: Record<string, unknown>[] } };
    root.computeChannels.data[0]!.escrow = "900719925474099312345";
    expect(parseIndexerData("computeChannels", root).data[0]!.escrow).toBe("900719925474099312345");
    for (const v of [1, "-1", "1.1", "1e18", null]) {
      root.computeChannels.data[0]!.escrow = v;
      expect(() => parseIndexerData("computeChannels", root)).toThrow();
    }
  });
  it("retains query provenance and uses variables", async () => {
    let body = "";
    const c = new McpClient({
      fetch: async (_url, init) => {
        body = String(init?.body);
        const request = JSON.parse(body) as { id: number };
        return Response.json({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: '{"block":null}' }] },
        });
      },
    });
    const hostile = '" } mutation { erase }';
    const result = await readIndexer(c, "block", { hash: hostile });
    expect(result.query).not.toContain(hostile);
    expect(result.variables.hash).toBe(hostile);
    expect(JSON.parse(body).params.arguments.variables.hash).toBe(hostile);
    expect(result.value).toBeNull();
    expect(result.attempts).toBe(1);
  });
  it("rejects invalid budgets before the network", async () => {
    const c = new McpClient({
      fetch: async () => {
        throw new Error("must not call");
      },
    });
    for (const limit of [0, -1, 101, 1.5, NaN]) await expect(readIndexer(c, "blocks", { limit })).rejects.toThrow();
    await expect(readIndexer(c, "block", { number: 2147483648 })).rejects.toThrow();
    await expect(readIndexer(c, "unknown" as IndexerEntity, {})).rejects.toThrow();
    expect(c.stats.requests).toBe(0);
  });
});
