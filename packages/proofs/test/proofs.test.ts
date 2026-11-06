// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import index from "../../recorder/test/fixtures/seed/index.json";
import schema from "../fixtures/schema.json";
import {
  analyzeRecording,
  coverageFor,
  createCollector,
  parseLeaderboard,
  parseProofs,
  parseRecording,
  proofHistory,
  proofReference,
  recordedHistory,
  recordedInput,
  recordedProofs,
  PROOF_QUERY,
  type Proof,
  type Evidence,
  type Sample,
} from "../src/index";

const proof: Proof = {
  id: "synthetic-schema-fixture",
  blockHash: `0x${"a".repeat(64)}`,
  blockNumber: 42,
  submitter: "fixture-miner",
  gnWeight: 123,
  successCount: 1,
  taskHash: `0x${"b".repeat(64)}`,
  timestamp: 1_700_000_000_000,
};
function inputWithProofs(rows: unknown[]) {
  const input = recordedInput();
  input.captures.find((c) => c.args.query === PROOF_QUERY)!.raw = JSON.stringify({ pouiProofs: rows });
  return input;
}
describe("recorded public observations", () => {
  it("replays raw empty proofs and all reported settlement pages with timestamps", () => {
    const report = recordedProofs();
    expect(report.proofs.value).toEqual({ rows: [], complete: true, reportedTotal: null });
    expect(report.stats.value?.proofs24h).toBe(0);
    expect(report.leaderboard.value).toEqual([]);
    expect(report.indexerLeaderboard.value).toEqual([]);
    expect(report.settlements.value?.rows).toHaveLength(349);
    expect(report.settlements.value?.complete).toBe(true);
    expect(report.coverage).toHaveLength(349);
    expect(new Set(report.coverage.map((c) => c.status))).toEqual(new Set(["UNVERIFIABLE"]));
    expect(report.coverage.every((c) => c.code === "NO_OBSERVED_PROOF")).toBe(true);
    expect(report.proofs.measuredAt).toBe("2026-11-06T01:30:05.133Z");
    expect(report.recording.requests).toBe(8);
  });
  it("confirms the observed schema cannot bind a paid channel or inspect a proof payload", () => {
    const data = JSON.parse(schema.raw) as {
      __schema: { types: { name: string; fields: { name: string }[] | null }[] };
    };
    const fields = data.__schema.types.find((t) => t.name === "PouiProof")!.fields!.map((f) => f.name);
    expect(fields).toContain("taskHash");
    for (const field of ["channelId", "modelHash", "outputHash", "proof", "toplocCommitment", "validatorAttestations"])
      expect(fields).not.toContain(field);
  });
  it("accepts faithful nonempty rows but never infers coverage from successCount, task ID, miner or block equality", () => {
    const input = recordedInput();
    const settlement = recordedProofs().settlements.value!.rows[0]!;
    const candidate = {
      ...proof,
      submitter: settlement.miner,
      taskHash: settlement.channelId,
      blockNumber: settlement.settledBlock,
      gnWeight: Number(settlement.aggregateGn),
      successCount: 999,
    };
    const report = analyzeRecording(inputWithProofs([candidate]));
    expect(report.proofs.value?.rows).toHaveLength(1);
    expect(report.coverage[0]).toMatchObject({ status: "UNVERIFIABLE", code: "NO_PUBLIC_BINDING" });
    expect(report.coverage[0]?.reason).toContain("Direct-rail credit is separate");
    expect(input.captures.length).toBeGreaterThan(0);
  });
  it("does not turn a failed or malformed source into zero proofs", () => {
    const input = inputWithProofs([{ ...proof, successCount: -1 }]);
    const report = analyzeRecording(input);
    expect(report.proofs.status).toBe("unavailable");
    expect(report.proofs.value).toBeNull();
    expect(report.coverage[0]?.code).toBe("PROOFS_UNAVAILABLE");
    input.captures.find((c) => c.args.query === PROOF_QUERY)!.raw = '{"errors":[{"message":"offline"}]}';
    expect(analyzeRecording(input).proofs.value).toBeNull();
  });
  it("keeps a missing stats field unavailable and measured null as null", () => {
    const input = recordedInput(),
      c = input.captures[0]!;
    c.raw = '{"stats":{"proofs24h":null,"latestBlockNumber":1}}';
    expect(analyzeRecording(input).stats.value?.proofs24h).toBeNull();
    c.raw = '{"stats":{"latestBlockNumber":1}}';
    expect(analyzeRecording(input).stats.status).toBe("unavailable");
  });
  it("represents genuinely empty and entirely missing observations", () => {
    const input = recordedInput();
    input.captures = [];
    const report = analyzeRecording(input);
    expect(report.coverage).toEqual([]);
    expect(report.settlements.value).toBeNull();
    const c = recordedInput().captures.find((c) => c.tool === "flop_list_settlements")!;
    c.raw = JSON.stringify({ data: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } });
    input.captures = [c];
    expect(analyzeRecording(input).settlements.value).toEqual({ rows: [], complete: true, reportedTotal: 0 });
  });
  it("marks truncated paging as partial and rejects a changed or duplicate population", () => {
    const input = recordedInput();
    input.captures = input.captures.slice(0, 5);
    expect(analyzeRecording(input).settlements.value?.complete).toBe(false);
    input.captures.push(input.captures[4]!);
    expect(analyzeRecording(input).settlements.status).toBe("unavailable");
    const full = recordedInput();
    const last = full.captures.at(-1)!;
    const raw = JSON.parse(last.raw!) as { pagination: { total: number } };
    raw.pagination.total++;
    last.raw = JSON.stringify(raw);
    expect(analyzeRecording(full).settlements.status).toBe("unavailable");
  });
  it("rejects repeated proof IDs instead of double counting", () => {
    expect(analyzeRecording(inputWithProofs([proof, proof])).proofs.status).toBe("unavailable");
  });
});

describe("hostile boundaries and missing evidence", () => {
  it.each([-1, NaN, Infinity, "1", 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid proof counts: %s", (value) => {
    expect(() => parseProofs({ pouiProofs: [{ ...proof, successCount: value }] })).toThrow();
  });
  it("preserves null proof fields without filling them", () => {
    const row = Object.fromEntries(Object.keys(proof).map((k) => [k, k === "id" ? "null-fields" : null]));
    expect(parseProofs({ pouiProofs: [row] })[0]?.successCount).toBeNull();
    expect(() => parseProofs({ pouiProofs: [{ id: "missing-fields" }] })).toThrow();
  });
  it("rejects malformed hashes, unsafe arrays and duplicate leaders", () => {
    expect(() => parseProofs({ pouiProofs: [{ ...proof, taskHash: "not-a-hash" }] })).toThrow();
    expect(() => parseProofs({ pouiProofs: Array(1001).fill(proof) })).toThrow();
    const leader = { submitter: "fixture", totalWeight: 10, proofsCount: 2 };
    expect(parseLeaderboard({ pouiLeaderboard: [leader] })).toEqual([leader]);
    expect(() => parseLeaderboard({ pouiLeaderboard: [leader, leader] })).toThrow();
  });
  it("rejects invalid replay metadata and untrusted source URLs", () => {
    const input = recordedInput();
    expect(() => parseRecording({ ...input, version: 2 })).toThrow();
    expect(() => parseRecording({ ...input, limit: 0 })).toThrow();
    input.captures[0]!.source = "https://untrusted.invalid";
    expect(() => parseRecording(input)).toThrow();
  });
  it("uses the explicit unavailable branch even if inconsistent typed input contains rows", () => {
    const unavailable: Evidence<Sample<Proof>> = {
      status: "unavailable",
      value: { rows: [proof], complete: false, reportedTotal: null },
      source: "fixture",
      measuredAt: "2026-11-06T01:30:05.133Z",
      reason: "fixture failure",
    };
    expect(coverageFor(recordedProofs().settlements.value!.rows[0]!, unavailable).code).toBe("PROOFS_UNAVAILABLE");
  });
});

describe("paper and recorder boundaries", () => {
  it("locates exact quotations and the three sampled-audit specification defaults", () => {
    const ref = proofReference();
    expect(ref.types.map((t) => t.id)).toEqual(["tee", "toploc", "reexecution", "aggregation"]);
    expect(ref.parameters.map((p) => [p.name, p.value])).toEqual([
      ["sampled_audit_alpha_ppm", "50_000 ppm"],
      ["audit_quantum_gn", "100_000_000 G_n"],
      ["high_value_gn_threshold", "10_000_000 G_n"],
    ]);
    expect(ref.parameters.every((p) => p.status === "SPECIFICATION_ONLY")).toBe(true);
    expect(ref.calls.some((c) => c.quote.includes("submit_toploc_evidence"))).toBe(true);
    expect(ref.rail.quote).toContain("compute channel");
    expect(ref.types.every((t) => t.evidence.source.includes(ref.sha))).toBe(true);
  });
  it("retains rolling zero counts without summing windows", () => {
    const history = recordedHistory();
    expect(history).toHaveLength(2);
    expect(history.map((p) => p.proofs24h.value)).toEqual([0, 0]);
    expect(history.map((p) => p.leaderboardRows.value)).toEqual([0, 0]);
  });
  it("keeps absent history points null and rejects fractional counts", () => {
    const data = structuredClone(index);
    delete (data.entries[0]!.fields as Record<string, unknown>)["stats.proofs24h"];
    expect(proofHistory(data)[0]?.proofs24h.value).toBeNull();
    data.entries[1]!.fields["stats.proofs24h"]!.value = 0.5;
    expect(() => proofHistory(data)).toThrow();
    expect(proofHistory({ version: 1, entries: [] })).toEqual([]);
  });
});

describe("bounded shared-client collection", () => {
  it("uses captured public responses, caches original timestamps and expires after the TTL", async () => {
    const captures = recordedInput().captures;
    let now = Date.now();
    const fetcher: typeof fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        id: number;
        params: { name: string; arguments: Record<string, unknown> };
      };
      const c = captures.find(
        (c) => c.tool === request.params.name && JSON.stringify(c.args) === JSON.stringify(request.params.arguments),
      );
      if (!c) throw new Error("Unexpected request");
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: c.raw }] } }),
      );
    };
    const client = new McpClient({ fetch: fetcher, minIntervalMs: 0, retries: 0 });
    const read = createCollector(client, () => now);
    const first = await read(1000);
    expect(client.stats.requests).toBe(8);
    expect(analyzeRecording({ ...first, finishedAt: new Date().toISOString() }).settlements.value?.rows).toHaveLength(
      349,
    );
    expect(await read(1000)).toEqual(first);
    expect(client.stats.requests).toBe(8);
    first.captures.length = 0;
    expect((await read(1000)).captures).toHaveLength(8);
    now += 60_000;
    await read(1000);
    expect(client.stats.requests).toBe(16);
    await expect(read(1001)).rejects.toThrow();
  });
  it("stops each failed resource without a paging loop and exposes no data", async () => {
    const client = new McpClient({
      fetch: async () => new Response("offline", { status: 503 }),
      retries: 0,
      minIntervalMs: 0,
    });
    const input = await createCollector(client)(1000);
    expect(client.stats.requests).toBe(5);
    expect(analyzeRecording(input).proofs.status).toBe("unavailable");
  });
  it.skipIf(process.env.FLOP_LIVE !== "1")("opt-in live source check", async ({ skip }) => {
    const report = analyzeRecording(await createCollector()(1));
    if (report.proofs.status === "unavailable") skip("Public source unavailable");
    expect(report.recording.captures.length).toBeLessThanOrEqual(5);
    expect(report.proofs.status).toBe("ok");
  });
});
