// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { loadClaims } from "../src/catalogue";
import { runHarness, parseFlop } from "../src/runner";
import { Transport } from "../src/transport";
import { compactReport, parseReport, renderBugDraft, renderMarkdown } from "../src/report";
import { array, object } from "../src/validation";
import { recordedFetch } from "./replay";

const claims = await loadClaims();
const noSleep = async () => {};
const transport = (fetch = recordedFetch(), maxRequests = 100) =>
  new Transport({ fetch, maxRequests, intervalMs: 0, sleep: noSleep });
const run = (id: string, fetch = recordedFetch(), maxRequests = 100) =>
  runHarness({ claims, only: id, transport: transport(fetch, maxRequests) });
const selected = (report: Awaited<ReturnType<typeof run>>, id: string) =>
  report.results.find((result) => result.claim.id === id)!;

describe("recorded public contracts", () => {
  it("loads traced unique claims with explicit risk", () => {
    expect(claims.length).toBeGreaterThanOrEqual(40);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(claims.length);
    expect(claims.every((claim) => claim.source.url.startsWith("https://") && claim.source.quote.length > 0)).toBe(
      true,
    );
  });
  it.each([
    "gateway-contract",
    "price-source-expiry",
    "model-registry",
    "model-serving",
    "settlement-conservation",
    "settlement-pagination",
    "invalid-limit",
    "indexer-stats-fields",
    "simulated-tee-label",
    "audit-rate",
  ])("%s accepts recorded evidence", async (id) => {
    const report = await run(id);
    expect(selected(report, id).status).toBe("PASS");
    expect(selected(report, id).attempts[0]?.evidence.length).toBeGreaterThan(0);
    expect(report.budget.requests).toBe(report.evidence.length);
  });
  it("rejects a corrupted gateway contract and confirms using fresh requests", async () => {
    const report = await run(
      "gateway-contract",
      recordedFetch((name, value) => (name === "gateway" ? { ...object(value), data: null } : value)),
    );
    const result = selected(report, "gateway-contract");
    expect(result.status).toBe("FAIL");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.evidence).not.toEqual(result.attempts[1]?.evidence);
  });
  it("rejects a one-raw-unit conservation error beyond floating point precision", async () => {
    const report = await run(
      "settlement-conservation",
      recordedFetch((name, value) => {
        if (name !== "flop_list_settlements") return value;
        const response = object(value);
        const rows = array(response.data);
        if (rows[0]) {
          const row = object(rows[0]);
          row.escrow = (BigInt(String(row.escrow)) + 1n).toString();
        }
        return response;
      }),
    );
    expect(selected(report, "settlement-conservation").status).toBe("FAIL");
  });
  it("does not call an empty settlement tape a pass", async () => {
    const report = await run(
      "settlement-conservation",
      recordedFetch((name, value) =>
        name === "flop_list_settlements"
          ? { data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } }
          : value,
      ),
    );
    expect(selected(report, "settlement-conservation").status).toBe("UNVERIFIABLE");
  });
  it("does not silently truncate a tape when the request budget ends", async () => {
    const report = await run("settlement-conservation", recordedFetch(), 3);
    expect(selected(report, "settlement-conservation").status).toBe("UNVERIFIABLE");
    expect(report.budget.requests).toBe(3);
  });
  it("detects broken hasMore and offset semantics", async () => {
    const report = await run(
      "settlement-pagination",
      recordedFetch((name, value) => {
        if (name === "flop_list_settlements") object(object(value).pagination).offset = 99;
        return value;
      }),
    );
    expect(selected(report, "settlement-pagination").status).toBe("FAIL");
  });
  it("plain-text unavailable resources are not protocol failures", async () => {
    const report = await run("mcp-check-session");
    expect(selected(report, "mcp-check-session").status).toBe("UNVERIFIABLE");
    expect(selected(report, "mcp-check-session").attempts[0]?.observed).toBe("Session not found.");
  });
  it("checks the real advertised output schema rather than inventing fields", async () => {
    const report = await run("mcp-knowledge-get");
    expect(selected(report, "mcp-knowledge-get").status).toBe("FAIL");
    expect(JSON.stringify(selected(report, "mcp-knowledge-get").attempts[0]?.observed)).toContain(
      "additionalProperties",
    );
  });
});

describe("budget and confirmation", () => {
  it("labels a recovered failure flaky and refuses a bug draft", async () => {
    let calls = 0;
    const report = await run(
      "gateway-contract",
      recordedFetch((name, value) => (name === "gateway" && calls++ === 0 ? {} : value)),
    );
    expect(selected(report, "gateway-contract")).toMatchObject({ status: "UNVERIFIABLE", flaky: true });
    expect(() =>
      renderBugDraft(report, "gateway-contract", {
        sha: "a".repeat(40),
        measuredAt: report.measuredAt,
        source: "test",
      }),
    ).toThrow("confirmed");
  });
  it("a confirmation blocked by budget is not a FAIL", async () => {
    const report = await run(
      "gateway-contract",
      recordedFetch((name, value) => (name === "gateway" ? {} : value)),
      3,
    );
    expect(selected(report, "gateway-contract")).toMatchObject({ status: "UNVERIFIABLE", flaky: true });
    expect(report.budget.requests).toBe(3);
  });
  it("zero request ceiling makes no network call", async () => {
    const report = await run(
      "gateway-contract",
      async () => {
        throw new Error("must not run");
      },
      0,
    );
    expect(report.budget.requests).toBe(0);
    expect(selected(report, "gateway-contract").status).toBe("SKIPPED");
  });
  it("offline errors are unavailable, not confirmed contract failures", async () => {
    const report = await run("gateway-contract", async () => {
      throw new Error("offline");
    });
    expect(selected(report, "gateway-contract").status).toBe("UNVERIFIABLE");
  });
  it("skips spending without opt-in and exposes missing prerequisites with opt-in", async () => {
    const base = { claims, only: "chaos-session-budget", maxFlop: "0.01" };
    const denied = await runHarness({ ...base, transport: transport() });
    expect(selected(denied, base.only).status).toBe("SKIPPED");
    const allowed = await runHarness({ ...base, allowSpend: true, transport: transport() });
    expect(selected(allowed, base.only).status).toBe("UNVERIFIABLE");
    expect(allowed.budget.spentFlop).toBe("0");
  });
  it.each(["-1", "1e3", "NaN", "0.0000000000000000001", "01", "+1", "Infinity"])(
    "rejects unsafe FLOP ceiling %s",
    (value) => expect(() => parseFlop(value)).toThrow(),
  );
  it("preserves the smallest raw unit", () => expect(parseFlop("0.000000000000000001")).toBe(1n));
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid request budget %s", (maxRequests) =>
    expect(() => transport(recordedFetch(), maxRequests)).toThrow(),
  );
  it("rejects unknown claim ids before network access", async () => {
    await expect(
      run("not-a-claim", async () => {
        throw new Error("must not run");
      }),
    ).rejects.toThrow("Unknown claim");
  });
});

describe("reports", () => {
  it("renders only confirmed failures with exact request excerpts and known unknowns", async () => {
    const report = await run("mcp-agent-pack-manifest");
    const compact = compactReport(report);
    const loaded = parseReport(JSON.parse(JSON.stringify(compact)));
    const draft = renderBugDraft(loaded, "mcp-agent-pack-manifest", {
      sha: "a".repeat(40),
      measuredAt: report.measuredAt,
      source: "test-only SHA fixture",
    });
    expect(draft).toContain("### Commit verified against");
    expect(draft).toContain("### Unknown");
    expect(draft).toContain("agent pack missing");
    expect(draft).toContain("https://mcp.flop.network/mcp");
    expect(renderMarkdown(compact)).toContain("Genesis: unavailable");
    expect(compact.evidence.every((item) => item.response.length <= 1024)).toBe(true);
    expect(() =>
      renderBugDraft(loaded, "mcp-agent-pack-manifest", {
        sha: "unknown",
        measuredAt: report.measuredAt,
        source: "test",
      }),
    ).toThrow("SHA");
  });
  it("rejects dangling evidence references", async () => {
    const report = await run("gateway-contract");
    selected(report, "gateway-contract").attempts[0]!.evidence.push(99999);
    expect(() => parseReport(report)).toThrow("Missing evidence");
  });
});
