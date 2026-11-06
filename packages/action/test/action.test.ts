// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_URL } from "@flop-lab/mcp";
import { fixtureTool, replayFetch } from "@flop-lab/mcp/fixtures";
import { requestBudget } from "../src/budget";
import { parseOptions, recordedCheck, runChecks, statusOf } from "../src/index";
import { jobSummary } from "../src/github";

describe("decisions", () => {
  it("never labels an empty or incomplete set as pass", () => {
    expect(statusOf([])).toBe("incomplete");
    expect(statusOf(["pass", "incomplete"])).toBe("incomplete");
    expect(statusOf(["incomplete", "fail"])).toBe("fail");
  });
  it("rechecks recorded arithmetic without calling the transport", async () => {
    const report = await runChecks(parseOptions({ checks: "tape" }), async () => {
      throw new Error("Unexpected network");
    });
    expect(report.status).toBe("pass");
    expect(report.exitCode).toBe(0);
    expect(report.requests).toBe(0);
    expect(report.checks[0]?.pass).toBeGreaterThan(0);
    expect(
      report.checks[0]?.sources.every(
        (source) => source.url.startsWith("https://") && Number.isFinite(Date.parse(source.measuredAt)),
      ),
    ).toBe(true);
  });
  it("retains the absence of a recorded MCP output schema", () => {
    const check = recordedCheck("contracts");
    expect(check.status).toBe("incomplete");
    expect(check.pass).toBeGreaterThan(0);
    expect(check.details.some((detail) => detail.includes("No outputSchema"))).toBe(true);
  });
  it("preserves spec evidence gaps", () => {
    const check = recordedCheck("spec");
    expect(check.incomplete).toBeGreaterThan(0);
    expect(check.sources.length).toBeGreaterThan(0);
  });
  it("allowing incomplete never changes the report to pass", async () => {
    const report = await runChecks(parseOptions({ checks: "contracts", failOnIncomplete: "false" }));
    expect(report.status).toBe("incomplete");
    expect(report.exitCode).toBe(0);
    const strict = await runChecks(parseOptions({ checks: "contracts" }));
    expect(strict.exitCode).toBe(2);
  });
});

describe("bounded transport", () => {
  it("shares one cap across failed checks and their retries", async () => {
    let attempts = 0;
    const report = await runChecks(
      parseOptions({ mode: "live", checks: "tape,spec,contracts", maxRequests: "1" }),
      async () => {
        attempts++;
        return new Response("unavailable", { status: 503 });
      },
    );
    expect(attempts).toBe(1);
    expect(report.requests).toBe(1);
    expect(report.checks.map((check) => check.status)).toEqual(["incomplete", "incomplete", "incomplete"]);
    expect(report.exitCode).toBe(2);
  });
  it("reserves the final budget slot before an asynchronous request", async () => {
    let attempts = 0;
    const budget = requestBudget(1, async (_url, init) => {
      attempts++;
      expect(init?.redirect).toBe("error");
      return new Response("{}", { status: 429 });
    });
    const outcomes = await Promise.allSettled([
      budget.fetch(DEFAULT_URL, { method: "POST" }),
      budget.fetch(DEFAULT_URL, { method: "POST" }),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected"]);
    expect(attempts).toBe(1);
    expect(budget.remaining).toBe(0);
  });
  it("blocks other destinations before making a request", async () => {
    const budget = requestBudget(2, async () => {
      throw new Error("Should not be sent");
    });
    await expect(budget.fetch("https://example.com", { method: "POST" })).rejects.toThrow("Only the public MCP");
    await expect(budget.fetch(DEFAULT_URL, { method: "GET" })).rejects.toThrow("Only the public MCP");
    expect(budget.requests).toBe(0);
  });
  it("treats a zero budget as incomplete without calling anything", async () => {
    const report = await runChecks(parseOptions({ mode: "live", maxRequests: "0" }), async () => {
      throw new Error("Unexpected network");
    });
    expect(report.status).toBe("incomplete");
    expect(report.requests).toBe(0);
  });
  it("fails tampered recorded arithmetic even when incomplete is allowed", async () => {
    const recorded = fixtureTool<{ data: Record<string, unknown>[] }>("flop_list_settlements");
    const row = { ...recorded.data[0], escrow: "1" };
    // Adapt the recorded row to the requested page size, then deliberately corrupt escrow.
    const raw = `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ data: [row], pagination: { limit: 25, offset: 0, total: 1, hasMore: false } }) }] } })}\n\n`;
    const report = await runChecks(
      parseOptions({ mode: "live", checks: "tape", failOnIncomplete: "false" }),
      replayFetch({ "call-flop_list_settlements": raw }),
    );
    expect(report.status).toBe("fail");
    expect(report.exitCode).toBe(1);
    expect(report.requests).toBe(1);
  });
});

describe("hostile inputs", () => {
  it.each(["", "tape,tape", "unknown", "tape; touch /tmp/owned", "$(id)"])("refuses check selection %s", (checks) => {
    expect(() => parseOptions({ checks })).toThrow();
  });
  it.each(["-1", "31", "1e1", "NaN", "1.5", "01", "Infinity"])("refuses budget %s", (maxRequests) => {
    expect(() => parseOptions({ maxRequests })).toThrow();
  });
  it("refuses misspelled modes and booleans", () => {
    expect(() => parseOptions({ mode: "LIVE" })).toThrow();
    expect(() => parseOptions({ failOnIncomplete: "yes" })).toThrow();
  });
  it("escapes remote text in the job summary", async () => {
    const report = await runChecks(parseOptions({}));
    report.checks[0]!.details = ["<script>alert(1)</script> | `code`\n## forged"];
    const summary = jobSummary(report);
    expect(summary).not.toContain("<script>");
    expect(summary).toContain("&lt;script&gt;");
    expect(summary).toContain("&#124;");
    expect(summary).not.toContain("\n## forged");
  });
});
