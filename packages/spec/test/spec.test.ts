// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { McpClient } from "@flop-lab/mcp";
import catalog from "../fixtures/knowledge.json";
import transactions from "../fixtures/transactions.json";
import transaction from "../fixtures/transaction.json";
import schema from "../fixtures/transaction-schema.json";
import stats from "../fixtures/stats.json";
import money from "../fixtures/money-path-v1.json";
import p0 from "../fixtures/paper-0.json";
import {
  cells,
  compare,
  createRuntimeReader,
  normalise,
  paperFromChunks,
  parseCatalog,
  parseRecording,
  parseTransactions,
  parseVectors,
  parseYellowpaper,
  recordedReport,
  recordedSpec,
  runtimeFromRecordings,
  type Item,
  type SpecModel,
} from "../src/index";

const time = "2026-11-05T20:44:57.274Z";
const pin = "2a2cc8218048a2933071bb2f45d75335560e39d8";
const empty = () => runtimeFromRecordings({});
const param = (name: string, value: string, unit = "blocks"): Item => ({
  id: `A:${name}`,
  appendix: "A",
  kind: "parameter",
  name,
  value,
  unit,
  section: "A",
  evidence: { source: "https://mcp.flop.network/mcp", measuredAt: time, quote: value },
});
const model = (items: Item[]): SpecModel => ({ sha: pin, measuredAt: time, items, warnings: [] });
const pair = (left: Item, right: Item) =>
  compare(model([left]), { ...empty(), catalogAvailable: true, parameters: [right] }, { mode: "recorded", at: time })
    .differences;

describe("pinned paper", () => {
  it("parses the real A, G and H rows with their source lines", () => {
    const spec = recordedSpec();
    expect(spec.sha).toBe(pin);
    const supply = spec.items.find((i) => i.id === "A:genesis_supply")!;
    expect(supply).toMatchObject({ value: "4_400_000_000", unit: "FLOP", enforced: true });
    expect(supply.evidence.source).toBe(`https://github.com/flop-labs/yellowpaper/blob/${pin}/yellowpaper.md#L2738`);
    expect(spec.items.find((i) => i.id === "G:compute_channel.top_up_escrow")).toMatchObject({
      arguments: ["channel_id", "amount"],
    });
    expect(spec.items.find((i) => i.id === "G:miner_staking.sponsor_register_miner")).toMatchObject({
      arguments: ["miner", "amount", "commission", "reward_policy"],
    });
    expect(spec.items.find((i) => i.id === "G:validators.do_slash")).toMatchObject({ arguments: null });
    expect(spec.items.find((i) => i.id === "H:Per-task path removal")?.value).toBe("LIVE");
    expect(spec.items.some((i) => i.id === "V:money-path:force-empty")).toBe(true);
    expect(spec.items.some((i) => i.id === "V:wire:reject:unknown_leaf_enum")).toBe(true);
    expect(spec.items.filter((i) => i.kind === "vector")).toHaveLength(51);
  });
  it("ignores fenced fake tables, handles escaped pipes and keeps unknown interfaces", () => {
    expect(cells("| `a|b` | x\\|y | z |")).toEqual(["`a|b`", "x|y", "z"]);
    const paper =
      '## Appendix A\n| Parameter | Value | § |\n|---|---|---|\n| <a id="param-x"></a>`x` | 42 blocks | §1 |\n```\n| <a id="param-fake"></a>`fake` | 0 blocks | §1 |\n```\n## Appendix G\n### G.3\n| Extrinsic | Pallet | Effect |\n|---|---|---|\n| session-key delegation | `session_keys` | Unknown |';
    const spec = parseYellowpaper(paper, pin, time);
    expect(spec.items.map((i) => i.name)).toEqual(["x", "session-key delegation"]);
    expect(spec.warnings).toContain("No Appendix H items parsed");
    expect(() =>
      parseYellowpaper(
        paper + '\n## Appendix A\n| Parameter | Value | § |\n| <a id="param-x"></a>`x` | 43 blocks | §1 |',
        pin,
        time,
      ),
    ).toThrow("Duplicate spec");
  });
  it("rejects gaps, mixed pins, oversized data and invalid vector expectations", () => {
    expect(() => paperFromChunks([{ ...p0, startLine: 2 }])).toThrow("Noncontiguous");
    expect(() => paperFromChunks([p0, { ...p0, startLine: 751, sha: "f".repeat(40) }])).toThrow("Mixed");
    expect(() => parseYellowpaper("x".repeat(2_000_001), pin, time)).toThrow("limit");
    expect(parseYellowpaper("", pin, time).items).toEqual([]);
    expect(() => parseVectors({ ...money, sha: "f".repeat(40) }, pin)).toThrow("commit");
    expect(() =>
      parseVectors(
        { ...money, raw: '{"version":"flop-money-path-v1","vectors":[{"id":"broken","status":"landed","input":{}}]}' },
        pin,
      ),
    ).toThrow("object");
  });
});

describe("public boundaries", () => {
  it("reads all recorded catalog values and retains warnings and quotes", () => {
    const c = parseCatalog(catalog);
    expect(c.parameters).toHaveLength(148);
    expect(c.warnings).toEqual(["provenance unavailable: repo sources are not mounted next to the catalog"]);
    expect(c.parameters.find((i) => i.name === "governor_default_enabled")?.value).toBe("false");
    expect(c.parameters.find((i) => i.name === "governor_default_enabled")?.evidence.quote).toContain('"false"');
  });
  it("reads sampled top-level names without inventing argument names", () => {
    const txs = parseTransactions(transactions);
    expect(txs.count).toBe(100);
    expect(txs.calls.map((i) => i.value).sort()).toEqual(["aleph.noteFinalized", "timestamp.set", "utility.batchAll"]);
    expect(txs.calls.every((i) => i.arguments === null)).toBe(true);
    expect(parseTransactions(transaction).count).toBe(1);
    const noRows = { ...transactions, raw: '{"transactions":[]}' };
    expect(parseTransactions(noRows)).toEqual({ calls: [], count: 0 });
  });
  it("rejects malformed and duplicate catalog rows and invalid provenance", () => {
    const content = "| Name | Value | Unit |\n|---|---|---|\n| `x` | 1 | blocks |\n| `x` | 2 | blocks |";
    expect(() =>
      parseCatalog({ ...catalog, raw: JSON.stringify({ concept: { id: "protocol-params" }, content, warnings: [] }) }),
    ).toThrow("Duplicate");
    expect(() => parseCatalog({ ...catalog, raw: "[]" })).toThrow("object");
    expect(() => parseRecording({ ...catalog, measuredAt: "not a date" })).toThrow("time");
    expect(() => parseRecording({ ...catalog, source: "javascript:alert(1)" })).toThrow("HTTPS");
    expect(() => parseTransactions({ ...transactions, raw: '{"transactions":[{"hash":"bad"}]}' })).toThrow();
    expect(runtimeFromRecordings({ catalog: { ...catalog, raw: "null" } }).catalogAvailable).toBe(false);
  });
});

describe("result semantics", () => {
  it("compares arbitrary-width integers exactly and detects a one-unit change", () => {
    expect(pair(param("cap", "9_007_199_254_740_993"), param("cap", "9007199254740993"))[0]?.result).toBe("MATCH");
    expect(pair(param("cap", "9007199254740993"), param("cap", "9007199254740992"))[0]?.result).toBe("DRIFT");
    expect(pair(param("cap", "10"), param("cap", "1"))[0]?.result).toBe("DRIFT");
  });
  it("normalises only explicit units and exact scalar presentation", () => {
    expect(normalise("20", "percent")).toEqual(normalise("200_000", "ppm"));
    expect(normalise("0.5", "FLOP")).toEqual(normalise("500000000000000000", "base units"));
    expect(normalise("-0.5", "FLOP").value).toBe("-500000000000000000");
    expect(pair(param("time", "1", "days"), param("time", "86400", "seconds"))[0]?.result).toBe("MATCH");
    expect(pair(param("time", "1", "blocks"), param("time", "1", "seconds"))[0]?.result).toBe("UNOBSERVABLE");
    expect(pair(param("x", "False", "bool"), param("x", "false", "bool"))[0]?.result).toBe("DRIFT");
    expect(normalise("1+2", "blocks").value).toBe("1+2");
  });
  it("does not fuzzy-match names or equate missing evidence with drift", () => {
    expect(pair(param("cap", "1"), param("Cap", "1")).map((d) => d.result)).toEqual(["SPEC_ONLY", "RUNTIME_ONLY"]);
    const report = compare(model([param("cap", "1")]), empty(), { mode: "recorded", at: time });
    expect(report.differences[0]?.result).toBe("UNOBSERVABLE");
    expect(report.counts.DRIFT).toBe(0);
  });
  it("does not bless call signatures from indexed positional argument values", () => {
    const observed = parseTransactions(transactions).calls[0]!;
    const spec = { ...observed, arguments: ["height"] };
    const runtime = { ...empty(), calls: [observed] };
    expect(compare(model([spec]), runtime, { mode: "recorded", at: time }).differences[0]?.result).toBe("UNOBSERVABLE");
    expect(
      compare(model([{ ...spec, arguments: null }]), runtime, { mode: "recorded", at: time }).differences[0]?.result,
    ).toBe("MATCH");
  });
  it("replays recorded claims without turning serialized quotes into defects", () => {
    const r = recordedReport();
    expect(r.counts.DRIFT).toBe(0);
    expect(r.differences.find((d) => d.name === "governor_default_enabled")?.result).toBe("MATCH");
    expect(r.differences.filter((d) => d.appendix === "H").every((d) => d.result === "UNOBSERVABLE")).toBe(true);
    expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.differences.length);
    expect(r.sha).toBe(pin);
  });
});

describe("bounded live reader and CLI", () => {
  it("memoises one bounded read and refreshes after its TTL", async () => {
    const fixtures = [catalog, stats, schema, transactions, transaction];
    let calls = 0;
    let now = 0;
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { id: number };
        const fixture = fixtures[calls++ % fixtures.length]!;
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: fixture.raw }] } }),
        );
      },
    });
    const reader = createRuntimeReader(client, () => now);
    const [a, b] = await Promise.all([reader(), reader()]);
    expect(a).toBe(b);
    expect(calls).toBe(5);
    expect(a.runtime.parameters).toHaveLength(148);
    now = 60_000;
    await reader();
    expect(calls).toBe(10);
  });
  it("keeps failures visible without repeated polling", async () => {
    const client = new McpClient({
      retries: 0,
      minIntervalMs: 0,
      fetch: async () => new Response("offline", { status: 503 }),
    });
    const result = await createRuntimeReader(client)();
    expect(result.runtime.catalogAvailable).toBe(false);
    expect(result.runtime.warnings.some((w) => w.includes("503"))).toBe(true);
    expect(result.requests).toBe(3);
  });
  it("supports JSON params and rejects invalid sections", () => {
    const output = execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "params", "--json"], {
      encoding: "utf8",
    });
    const result = JSON.parse(output) as { sha: string; differences: { appendix: string }[] };
    expect(result.sha).toBe(pin);
    expect(result.differences.every((d) => d.appendix === "A")).toBe(true);
    expect(spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "diff", "--section", "X"]).status).toBe(2);
  });
  it.skipIf(process.env.FLOP_SPEC_LIVE !== "1")(
    "validates a live public sample or reports offline",
    async (context) => {
      const data = await createRuntimeReader()();
      if (!data.runtime.catalogAvailable) {
        context.skip();
        return;
      }
      expect(data.runtime.parameters.length).toBeGreaterThan(0);
      expect(data.runtime.measuredAt).not.toBeNull();
    },
    90_000,
  );
});
