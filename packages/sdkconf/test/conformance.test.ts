// SPDX-License-Identifier: Apache-2.0
import { beforeAll, describe, expect, it } from "vitest";
import { runSuite, classify, parseReport, catalogue } from "../src/index.ts";
import type { Report } from "../src/model.ts";

let report: Report;
beforeAll(async () => {
  report = await runSuite({ python: "/nonexistent-sdkconf-python" });
}, 30000);

describe("published artifact conformance", () => {
  it("replays each gateway client guarantee without network or skips", () => {
    const client = report.results.filter((r) => r.sdk === "client");
    expect(client).toHaveLength(catalogue.filter((s) => s.sdk === "client").length);
    expect(client.map((r) => [r.id, r.status])).toEqual(client.map((r) => [r.id, "PASS"]));
    expect(report.networkRequests).toBe(0);
    expect(client.find((r) => r.id === "client-input")?.attempts[0]?.trace).toEqual([]);
    expect(client.find((r) => r.id === "client-invalid-keys")?.attempts[0]?.trace).toEqual([]);
  });
  it.each([71, 72, 78, 82, 89])("detects existing regression #%i on both attempts", (issue) => {
    const matching = report.results.filter((r) => r.issue === issue);
    expect(matching.length).toBeGreaterThan(0);
    for (const r of matching) {
      expect(r.status).toBe("FAIL");
      expect(r.attempts.map((a) => a.passed)).toEqual([false, false]);
    }
  });
  it("records actual unpaid and proof-bearing request counts", () => {
    const direct = report.results.find((r) => r.id === "sdk-x402-function")!;
    const wrapped = report.results.find((r) => r.id === "sdk-x402-class")!;
    expect(direct.status).toBe("PASS");
    expect(direct.attempts[0]?.trace.map((t) => t.status)).toEqual([402, 200]);
    expect(wrapped.attempts[0]?.trace.map((t) => t.status)).toEqual([402, 402, 200]);
    expect(wrapped.attempts[0]?.trace.filter((t) => t.headers["x-payment-proof"])).toHaveLength(1);
    expect(wrapped.attempts[0]?.trace.map((t) => t.body)).toEqual(Array(3).fill('{"prompt":"offline"}'));
  });
  it("checks the documented example rather than silently correcting it", () => {
    const r = report.results.find((r) => r.id === "sdk-header-example")!;
    expect(r.status).toBe("FAIL");
    expect(r.citation.basis).toBe("documented");
    expect(r.attempts[0]?.observed).toContain("TypeError");
  });
  it("runs published CLI startup and marks unavailable coverage explicitly", () => {
    expect(report.results.find((r) => r.id === "cli-version")?.status).toBe("PASS");
    expect(report.results.find((r) => r.id === "cli-help")?.status).toBe("PASS");
    expect(report.results.filter((r) => r.status === "SKIPPED").map((r) => r.id)).toEqual([
      "cli-wallet",
      "sdk-mcp",
      "python-health",
    ]);
  });
  it("validates every saved verdict and rejects tampering", () => {
    expect(parseReport(report)).toEqual(report);
    const tampered = structuredClone(report);
    tampered.results.find((r) => r.status === "FAIL")!.status = "PASS";
    expect(() => parseReport(tampered)).toThrow("contradicts");
    expect(() => parseReport({ ...report, results: [report.results[0], report.results[0]] })).toThrow();
    expect(() => parseReport({ ...report, measuredAt: "bad" })).toThrow();
    const negative = structuredClone(report);
    negative.results[0]!.attempts[0]!.trace[0]!.atMs = -1;
    expect(() => parseReport(negative)).toThrow();
    const invalidUrl = structuredClone(report);
    invalidUrl.results[0]!.attempts[0]!.trace[0]!.url = "not a URL";
    expect(() => parseReport(invalidUrl)).toThrow();
    invalidUrl.results[0]!.attempts[0]!.trace[0]!.url = "https://api.flop.network/v1/models";
    expect(() => parseReport(invalidUrl)).toThrow();
  });
});

describe("verdict policy", () => {
  it.each([
    [[], "SKIPPED"],
    [[true], "PASS"],
    [[false], "SKIPPED"],
    [[false, false], "FAIL"],
    [[true, false], "SKIPPED"],
    [[false, true], "SKIPPED"],
    [[true, true], "PASS"],
  ] as const)("classifies %j as %s", (attempts, expected) => {
    expect(classify(attempts)).toBe(expected);
  });
  it.each([null, [], {}, { schema: "flop-sdkconf/v1", results: [] }])("rejects hostile reports", (value) => {
    expect(() => parseReport(value)).toThrow();
  });
  it("refuses unknown selectors before dispatch", async () => {
    await expect(runSuite({ scenario: "missing" })).rejects.toThrow("Unknown scenario");
  });
  it("keeps the caller's fetch isolated", async () => {
    const fetch = globalThis.fetch;
    const r = await runSuite({ scenario: "client-empty" });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.status).toBe("PASS");
    expect(globalThis.fetch).toBe(fetch);
  }, 10000);
});
