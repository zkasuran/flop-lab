// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { McpClient } from "@flop-lab/mcp";
import {
  analyzeRecording,
  classifyLag,
  collect,
  createMonitor,
  parseBlocks,
  parseRecording,
  QUOTES,
  RULES,
} from "../src/index";
import fixture from "./fixtures/observation.json";
import blockFixture from "./fixtures/block.json";
import blocksFixture from "./fixtures/blocks.json";
import schema from "./fixtures/schema.json";
import paper from "./fixtures/paper.json";

const recording = parseRecording(fixture);
const body = () =>
  JSON.parse(recording.raw) as {
    blocks: {
      hash: string;
      parentHash: string | null;
      number: number;
      timestamp: number | null;
      extrinsicsCount: number;
      specVersion: number;
    }[];
    stats: {
      finality: {
        bestBlock: number;
        finalizedBlock: number | null;
        finalizedLag: number | null;
        state: string;
        safeMode: boolean;
        thresholds: typeof RULES;
      } | null;
    };
  };
const withBody = (value: unknown) => ({ ...recording, raw: JSON.stringify(value) });

describe("recorded public evidence", () => {
  it("measures exact linked intervals and same-response finality heads", () => {
    const r = analyzeRecording(recording);
    expect(r.production).toEqual({
      intervals: 23,
      excluded: 0,
      medianMs: 1000,
      minMs: 999,
      maxMs: 1001,
      aboveTarget: 2,
    });
    expect(r.lag).toBe(4);
    expect(r.finality?.bestBlock).toBe(3005614);
    expect(r.finality?.finalizedBlock).toBe(3005610);
    expect(r.thresholdsMatch).toBe(true);
    expect(r.lagState).toBe("normal");
    // The indexed strip is behind the separately reported best head in this same query.
    expect(r.blocks.at(-1)?.number).toBe(3005612);
    expect(r.indexedTipAgeMs).toBe(2604);
  });
  it("keeps lookup agreement separate from independent proof", () => {
    expect(blockFixture.value.block).toEqual(blocksFixture.value[0]);
    expect(schema.value.statsType.fields.map((f) => f.name)).toContain("finality");
    expect(schema.value.__schema.queryType.fields.map((f) => f.name)).not.toContain("validators");
  });
  it("pins the thresholds and exact rule wording to recorded paper excerpts", () => {
    const raw = paper.excerpts.map((e) => e.text).join("\n");
    for (const quote of Object.values(QUOTES)) expect(raw).toContain(quote);
    expect(raw).toContain("`finality_lag_warn` | 30 blocks");
    expect(raw).toContain("`finality_freeze_threshold` | 120 blocks");
    expect(raw).toContain("`max_finality_stall` | 3_600 blocks");
  });
});

describe("decision boundaries", () => {
  it.each([
    [0, "normal"],
    [30, "normal"],
    [31, "warn"],
    [119, "warn"],
    [120, "freeze"],
    [3599, "freeze"],
    [3600, "escape-eligible"],
    [null, "unavailable"],
  ] as const)("classifies %s as %s", (lag, expected) => expect(classifyLag(lag)).toBe(expected));
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid lag %s", (lag) =>
    expect(() => classifyLag(lag)).toThrow(),
  );
  it("retains unavailable finality without inventing zero", () => {
    const b = body();
    b.stats.finality = null;
    const r = analyzeRecording(withBody(b));
    expect(r.lag).toBeNull();
    expect(r.lagState).toBe("unavailable");
    expect(r.production.intervals).toBe(23);
  });
  it("rejects inconsistent heads but preserves production evidence", () => {
    const b = body();
    b.stats.finality!.finalizedLag = 0;
    const r = analyzeRecording(withBody(b));
    expect(r.lagState).toBe("unavailable");
    expect(r.finalityError).toContain("Inconsistent");
  });
  it("rejects future finalized heads and partial null heads", () => {
    const b = body();
    b.stats.finality!.finalizedBlock = b.stats.finality!.bestBlock + 1;
    expect(analyzeRecording(withBody(b)).finalityError).toContain("Inconsistent");
    b.stats.finality!.finalizedBlock = null;
    expect(analyzeRecording(withBody(b)).finalityError).toContain("Incomplete");
  });
  it("does not compute lag from the block strip or overwrite parameter drift", () => {
    const b = body();
    b.stats.finality!.thresholds = { ...RULES, warnBlocks: 29 } as unknown as typeof RULES;
    const r = analyzeRecording(withBody(b));
    expect(r.thresholdsMatch).toBe(false);
    expect(r.lag).toBe(4);
  });
});

describe("hostile and empty blocks", () => {
  it("represents empty and singleton windows as no timing data", () => {
    const b = body();
    b.blocks = [];
    expect(analyzeRecording(withBody(b)).production.medianMs).toBeNull();
    b.blocks = body().blocks.slice(0, 1);
    expect(analyzeRecording(withBody(b)).production.intervals).toBe(0);
  });
  it("does not divide elapsed time across missing heights", () => {
    const b = body();
    b.blocks.splice(2, 1);
    const r = analyzeRecording(withBody(b));
    expect(r.production.excluded).toBe(1);
    expect(r.pairs.some((p) => p.reason === "missing height")).toBe(true);
  });
  it("excludes broken parent links, absent timestamps and reversed clocks", () => {
    const b = body();
    b.blocks[0]!.parentHash = "0x" + "0".repeat(64);
    b.blocks[5]!.timestamp = null;
    b.blocks[10]!.timestamp = b.blocks[11]!.timestamp;
    const r = analyzeRecording(withBody(b));
    expect(r.production.excluded).toBe(4);
    expect(r.pairs.map((p) => p.reason)).toEqual(
      expect.arrayContaining(["parent mismatch", "missing timestamp", "non-increasing timestamp"]),
    );
  });
  it("excludes timestamps after the measured time", () => {
    const b = body();
    b.blocks[0]!.timestamp = Date.parse(recording.measuredAt) + 1;
    expect(analyzeRecording(withBody(b)).pairs.at(-1)?.reason).toBe("future timestamp");
  });
  it("rejects duplicates, oversized windows, invalid hashes and malformed JSON boundaries", () => {
    const b = body();
    b.blocks[0] = b.blocks[1]!;
    expect(() => parseBlocks(b)).toThrow("Duplicate");
    expect(() => parseBlocks({ blocks: [...body().blocks, ...body().blocks] })).toThrow("exceeds");
    const bad = body();
    bad.blocks[0]!.hash = "<script>";
    expect(() => parseBlocks(bad)).toThrow("hash");
    expect(() => parseRecording({ ...recording, source: "https://example.com" })).toThrow();
    expect(() => parseRecording({ ...recording, measuredAt: "yesterday" })).toThrow();
    expect(() => analyzeRecording({ ...recording, raw: "null" })).toThrow();
    expect(() => analyzeRecording(withBody({ errors: [{ message: "bad" }], ...body() }))).toThrow();
  });
});

describe("bounded collection", () => {
  it("replays raw MCP text through the shared client and counts requests", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: recording.raw }] } }),
        ),
    );
    const client = new McpClient({ fetch: fetcher, retries: 0, now: () => Date.parse(recording.measuredAt) });
    const result = await collect(client);
    expect(result.raw).toBe(recording.raw);
    expect(result.requests).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("coalesces concurrent calls and expires from completion", async () => {
    let now = 0;
    const load = vi.fn(async () => recording);
    const read = createMonitor(load, () => now);
    await Promise.all([read(), read()]);
    now = 14999;
    await read();
    expect(load).toHaveBeenCalledTimes(1);
    now = 15000;
    await read();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("caches failure to avoid retry storms", async () => {
    const load = vi.fn(async () => {
      throw new Error("offline");
    });
    const read = createMonitor(load, () => 0);
    await expect(read()).rejects.toThrow("offline");
    await expect(read()).rejects.toThrow("offline");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
