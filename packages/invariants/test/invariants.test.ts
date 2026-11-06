// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { object } from "@flop-lab/spec";
import {
  attachChecks,
  coverageFor,
  parseSections,
  parseSource,
  recordedCatalogue,
  recordedInputs,
  recordedSources,
  reviewedIds,
  runChecks,
  runSuite,
  signalFor,
  type Check,
} from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("pinned normative catalogue", () => {
  it("covers every recorded row, rule and actor without silently dropping gaps", () => {
    const rows = recordedCatalogue();
    expect(rows).toHaveLength(78);
    expect(rows.filter((r) => r.kind === "failure")).toHaveLength(54);
    expect(rows.filter((r) => r.kind === "invariant")).toHaveLength(11);
    expect(rows.filter((r) => r.kind === "policy")).toHaveLength(7);
    expect(rows.filter((r) => r.kind === "penalty")).toHaveLength(6);
    expect(rows.map((r) => r.id).sort()).toEqual(reviewedIds().sort());
    expect([...new Set(rows.filter((r) => r.kind === "failure").map((r) => r.actor))]).toHaveLength(7);
    for (const row of rows) {
      expect(coverageFor(row).violation.length).toBeGreaterThan(20);
      expect(coverageFor(row).boundary.length).toBeGreaterThan(20);
    }
    expect(rows.find((r) => r.id === "M14")?.flags).toEqual(["GAP", "ASSUMED"]);
    expect(rows.find((r) => r.id === "P4")?.flags).toEqual(["OOS"]);
    expect(rows.find((r) => r.id === "fail_task")?.flags).toEqual(["REMOVED"]);
  });
  it("locates exact source bytes and preserves every table cell", () => {
    for (const rule of recordedCatalogue()) {
      const source = recordedSources().find(
        (s) => rule.quote.line >= s.firstLine && rule.quote.line < s.firstLine + s.raw.split("\n").length,
      )!;
      expect(
        source.raw
          .split("\n")
          .slice(rule.quote.line - source.firstLine, rule.quote.endLine - source.firstLine + 1)
          .join("\n"),
      ).toBe(rule.quote.text);
      for (const cell of rule.cells) expect(rule.quote.text).toContain(cell.quote);
    }
    expect(recordedCatalogue().find((r) => r.id === "R11.2b")?.quote.text).toContain(
      "Future independently audited public work credit",
    );
    expect(recordedCatalogue().find((r) => r.id === "V11")?.cells).toHaveLength(5);
  });
  it("retains new rows as unreviewed rather than inventing coverage", () => {
    const source = recordedSources()[1]!;
    source.raw = source.raw.replace("| M1 |", "| M99 |");
    const row = parseSections([source]).find((r) => r.id === "M99")!;
    expect(coverageFor(row).checks).toEqual([]);
    expect(coverageFor(row).boundary).toContain("has not been reviewed");
  });
  it("rejects empty, duplicate, malformed and unpinned sources", () => {
    expect(() => parseSections([])).toThrow("Empty");
    expect(() => parseSections([recordedSources()[0], recordedSources()[0]])).toThrow("duplicate");
    const source = recordedSources()[0]!;
    for (const bad of [
      null,
      {},
      { ...source, measuredAt: "never" },
      { ...source, firstLine: -1 },
      { ...source, url: "https://example.com" },
      { ...source, raw: "x".repeat(200_000) },
    ])
      expect(() => parseSource(bad)).toThrow();
    expect(() => parseSections([{ ...source, raw: source.raw.replace("| Supply |", "| Supply | extra |") }])).toThrow(
      "Malformed",
    );
  });
});

describe("scoped result decisions", () => {
  it("never promotes absent checks to success and lets a contradiction win", () => {
    expect(signalFor([], true)).toBe("NO_DATA");
    expect(signalFor([], false)).toBe("UNOBSERVABLE");
    expect(signalFor([{ status: "UNVERIFIABLE" }], true)).toBe("NO_DATA");
    expect(signalFor([{ status: "PASS" }, { status: "FAIL" }], true)).toBe("MISMATCH");
    expect(signalFor([{ status: "PASS" }, { status: "UNVERIFIABLE" }], true)).toBe("OBSERVED");
  });
  it("keeps unrelated suite failures out of a rule and matches every sampled escrow", () => {
    const check = (id: string, status: Check["status"]): Check => ({
      id,
      suite: "indexer",
      status,
      reason: "fixture",
      evidence: [],
    });
    const checks = [
      check("indexer:escrow-0", "PASS"),
      check("indexer:escrow-1", "FAIL"),
      check("indexer:miner-total", "FAIL"),
    ];
    const channel = attachChecks(recordedCatalogue(), checks).find((r) => r.id === "Channel")!;
    expect(channel.signal).toBe("MISMATCH");
    expect(channel.results.some((r) => r.id === "indexer:miner-total")).toBe(false);
    expect(channel.results.filter((r) => r.id.startsWith("indexer:escrow-"))).toHaveLength(2);
    expect(attachChecks(recordedCatalogue(), checks).find((r) => r.id === "M14")?.signal).toBe("UNOBSERVABLE");
  });
});

describe("native suite replay", () => {
  it("executes all imported libraries on recorded real responses without a network request", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Network access is forbidden in replay");
    });
    vi.stubGlobal("fetch", fetch);
    const completed: string[] = [];
    const result = await runChecks(recordedInputs(), (suite) => completed.push(suite));
    expect(completed).toEqual(["verifier", "indexer", "harness", "spec"]);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.requests).toBe(0);
    expect(result.counts).toEqual({ OBSERVED: 18, MISMATCH: 0, NO_DATA: 14, UNOBSERVABLE: 46 });
    expect(
      result.entries
        .flatMap((r) => r.results)
        .some((c) => c.reason === "The suite produced no matching check for this input."),
    ).toBe(false);
    expect(result.entries.find((r) => r.id === "M1")?.results.find((r) => r.suite === "harness")?.status).toBe("PASS");
    for (const entry of result.entries)
      for (const check of entry.results)
        if (check.status === "PASS") {
          expect(check.evidence.length).toBeGreaterThan(0);
          for (const evidence of check.evidence) expect(Number.isFinite(Date.parse(evidence.measuredAt))).toBe(true);
        }
  });
  it("detects a one-unit escrow contradiction in native indexer input", async () => {
    const input = recordedInputs();
    const snapshot = object(input.indexer);
    const observations = snapshot.observations as { id: string; raw: string }[];
    const observation = observations.find((o) => o.id === "indexer")!;
    const raw = object(JSON.parse(observation.raw));
    const rows = object(raw.settlementPrices).data as Record<string, unknown>[];
    rows[0]!.minerPaid = (BigInt(String(rows[0]!.minerPaid)) + 1n).toString();
    observation.raw = JSON.stringify(raw);
    const result = await runChecks(input);
    expect(result.entries.find((r) => r.id === "Channel")?.signal).toBe("MISMATCH");
    expect(
      result.entries.find((r) => r.id === "Channel")?.results.find((r) => r.id === "indexer:escrow-0")?.status,
    ).toBe("FAIL");
  });
  it("does not turn missing inputs, corrupted hashes or failed replays into observed checks", async () => {
    const result = await runChecks({});
    expect(result.counts.OBSERVED).toBe(0);
    expect(result.counts.MISMATCH).toBe(0);
    expect(result.counts.NO_DATA).toBe(32);
    const input = object(recordedInputs().verifier);
    input.sha256 = "0".repeat(64);
    expect((await runSuite("verifier", input)).every((c) => c.status === "UNVERIFIABLE")).toBe(true);
    expect((await runSuite("harness", [])).every((c) => c.status === "UNVERIFIABLE")).toBe(true);
    await expect(runChecks(null as never)).rejects.toThrow("Expected");
  });
  it("does not claim a no-link HTLC or a missing transcript was verified", async () => {
    const result = await runChecks();
    expect(result.entries.find((r) => r.id === "HTLC")?.signal).toBe("NO_DATA");
    expect(result.entries.find((r) => r.id === "R11.2a")?.signal).toBe("NO_DATA");
    expect(result.entries.find((r) => r.id === "INV-M06")?.boundary).toContain("Atomic rollback");
  });
  it("runs harness predicates with only the recorded evidence each one uses", async () => {
    const checks = await runSuite("harness", recordedInputs().harness);
    const registry = checks.find((c) => c.id === "harness:model-registry")!;
    const rate = checks.find((c) => c.id === "harness:audit-rate")!;
    expect(registry.status).toBe("PASS");
    expect(rate.status).toBe("PASS");
    expect(registry.evidence.some((e) => e.detail.includes("flop_discover_models"))).toBe(true);
    expect(rate.evidence.some((e) => e.detail.includes("flop_discover_models"))).toBe(false);
    expect(rate.evidence.some((e) => e.detail.includes("flop_trust_root"))).toBe(true);
  });
});
