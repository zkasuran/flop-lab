// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import { classify, Explorer, formatExploration, parseBalance, settlementArithmetic } from "../src/index";

const fixture = (name: string): { raw: string } =>
  JSON.parse(readFileSync(new URL(`../../mcp/fixtures/indexer-${name}.json`, import.meta.url), "utf8"));
const single = (name: string): Record<string, unknown> =>
  (JSON.parse(fixture(name).raw) as Record<string, Record<string, unknown>>)[name]!;
const channel = single("computeChannel").channelId as string;
const htlc = single("htlc").hashLock as string;
const account = single("account").address as string;
function replay(overrides: Record<string, unknown> = {}) {
  return new McpClient({
    minIntervalMs: 0,
    retries: 0,
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        id: number;
        params: { name: string; arguments: { query?: string; variables?: Record<string, unknown> } };
      };
      const { name, arguments: args } = request.params;
      let text: string;
      if (name === "flop_get_balance") text = fixture("balance").raw;
      else if (name === "flop_check_htlc") text = fixture("check-htlc").raw;
      else {
        const root = /\{\s*(\w+)/.exec(args.query ?? "")?.[1] ?? "";
        let value: unknown;
        if (Object.hasOwn(overrides, root)) value = overrides[root];
        else if (["block", "transaction", "account", "computeChannel", "htlc", "settlementPrice"].includes(root)) {
          const row = single(root);
          const variables = args.variables ?? {};
          value = Object.entries(variables).every(([k, v]) => row[k] === v) ? row : null;
        } else value = (JSON.parse(fixture(root).raw) as Record<string, unknown>)[root];
        text = JSON.stringify({ [root]: value });
      }
      return Response.json({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text }] } });
    },
  });
}
describe("search and evidence", () => {
  it("classifies ambiguity and rejects hostile input before IO", () => {
    expect(classify(channel).kinds).toEqual(["block", "transaction", "channel", "htlc"]);
    expect(classify("00042")).toEqual({ input: "42", kinds: ["block"] });
    expect(classify(`channel:${channel}`).kinds).toEqual(["channel"]);
    for (const input of ["", "-1", "2147483648", "1.5", "0x12", "account:12", "mutation { delete }", "x".repeat(129)])
      expect(() => classify(input)).toThrow();
  });
  it("returns a real channel and retains every lookup query", async () => {
    const result = await new Explorer(replay()).search(channel);
    expect(result.status).toBe("found");
    expect(result.entities.map((e) => e.kind)).toEqual(["channel"]);
    expect(result.requests).toBe(5);
    expect(result.lookups).toHaveLength(4);
    expect(result.lookups.every((e) => e.query?.includes("query Explorer"))).toBe(true);
    expect(result.entities[0]!.derived).toEqual([]);
    expect(formatExploration(result)).toContain("No indexed match");
  });
  it("does not turn checker unavailability into nonexistence", async () => {
    const result = await new Explorer(replay()).search(`htlc:${htlc}`);
    expect(result.status).toBe("partial");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.evidence[1]!.raw).toBe("HTLC not found or RPC unavailable.");
  });
  it("keeps live balance separate from indexer balance", async () => {
    const result = await new Explorer(replay()).search(account);
    expect(result.requests).toBe(10);
    expect(result.entities[0]!.evidence[0]!.data).toMatchObject({ balance: "0" });
    expect(result.entities[0]!.evidence[1]!.data).toMatchObject({ free: "982733.751658686104961808 FLOP" });
    expect(result.entities[0]!.evidence[1]!.data).not.toHaveProperty("frozen");
  });
  it("distinguishes empty, failed and mismatched lookups", async () => {
    expect((await new Explorer(replay()).search(`tx:0x${"0".repeat(64)}`)).status).toBe("not_found");
    expect((await new Explorer(replay({ transaction: {} })).search(`tx:${single("transaction").hash}`)).status).toBe(
      "unavailable",
    );
    expect(
      (await new Explorer(replay({ transaction: single("transaction") })).search(`tx:0x${"0".repeat(64)}`)).status,
    ).toBe("unavailable");
  });
  it("preserves multiple valid matches", async () => {
    const transaction = { ...single("transaction"), hash: channel };
    const result = await new Explorer(replay({ transaction })).search(channel);
    expect(result.entities.map((e) => e.kind)).toEqual(["transaction", "channel"]);
  });
  it("coalesces concurrent calls and expires cache without exposing mutable state", async () => {
    let now = 1000;
    const c = replay(),
      explorer = new Explorer(c, () => now);
    const [first, second] = await Promise.all([
      explorer.search(`channel:${channel}`),
      explorer.search(`channel:${channel}`),
    ]);
    expect(first.requests).toBe(2);
    expect(second.requests).toBe(0);
    first.entities.length = 0;
    expect((await explorer.search(`channel:${channel}`)).entities).toHaveLength(1);
    expect(c.stats.requests).toBe(2);
    now += 15000;
    expect((await explorer.search(`channel:${channel}`)).cache).toBe("miss");
    expect(c.stats.requests).toBe(4);
  });
  it("checks escrow exactly and rejects missing or malformed terms", () => {
    const price = single("settlementPrice");
    expect(settlementArithmetic(price)?.value).toBe("CONSERVED");
    expect(settlementArithmetic({ ...price, escrow: (BigInt(price.escrow as string) + 1n).toString() })?.value).toBe(
      "MISMATCH",
    );
    for (const value of [null, {}, { ...price, burned: null }, { ...price, escrow: "-1" }, { ...price, escrow: 1 }])
      expect(settlementArithmetic(value)).toBeNull();
  });
  it("rejects coercible balance values", () => {
    for (const v of [
      {},
      null,
      { address: account, free: 1, reserved: "0 FLOP", nonce: 0 },
      { address: account, free: "1 FLOP", reserved: "0 FLOP", nonce: "0" },
    ])
      expect(() => parseBalance(v)).toThrow();
  });
});
