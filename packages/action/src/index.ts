// SPDX-License-Identifier: Apache-2.0
import { McpClient, DEFAULT_URL } from "@flop-lab/mcp";
import { EvidenceFetcher } from "@flop-lab/verifier";
import { compare, createRuntimeReader, recordedSpec } from "@flop-lab/spec";
import { runAudit } from "@flop-lab/mcpaudit";
import { requestBudget } from "./budget";
import { parseOptions } from "./options";
import { recordedCheck, specResult } from "./recorded";
import { result, statusOf, verdict } from "./results";
import type { CheckResult, Options, Report } from "./types";
export { parseOptions, recordedCheck, statusOf };
export type * from "./types";

/** Run selected suite checks with one shared HTTP cap. @example await runChecks(parseOptions({checks: 'tape'})) */
export async function runChecks(options: Options, transport: typeof fetch = fetch): Promise<Report> {
  // Validate library input too. TypeScript types do not validate JavaScript callers.
  const config = parseOptions({
    checks: options.checks.join(","),
    mode: options.mode,
    maxRequests: String(options.maxRequests),
    failOnIncomplete: String(options.failOnIncomplete),
  });
  const started = performance.now();
  const budget = requestBudget(config.mode === "recorded" ? 0 : config.maxRequests, transport);
  const client = new McpClient({ fetch: budget.fetch, retries: 1, minIntervalMs: 500, timeoutMs: 10_000 });
  const checks: CheckResult[] = [];
  for (const name of config.checks) {
    try {
      if (config.mode === "recorded") checks.push(recordedCheck(name));
      else if (!budget.remaining) checks.push(result(name, [], [], ["Request budget exhausted before this check"]));
      else if (name === "tape") {
        const tape = await new EvidenceFetcher({ client, ttlMs: 0 }).tape(25);
        const rows = tape.rows.flatMap((row) => row.checks);
        checks.push(
          result(
            name,
            [...rows.map((check) => verdict(check.status)), ...tape.errors.map(() => "incomplete" as const)],
            tape.observations.map((observation) => ({ url: observation.source, measuredAt: observation.measuredAt })),
            [...tape.errors, ...rows.filter((check) => check.status !== "PASS").map((check) => check.detail)],
          ),
        );
      } else if (name === "spec") {
        const { runtime } = await createRuntimeReader(client)();
        checks.push(specResult(compare(recordedSpec(), runtime, { mode: "live", at: new Date().toISOString() })));
      } else {
        const audit = await runAudit({ tool: "flop_get_stats", maxRequests: budget.remaining, fetch: budget.fetch });
        checks.push(
          result(
            name,
            [
              ...audit.tools.map((tool) => verdict(tool.status)),
              ...(audit.discoveryError ? ["incomplete" as const] : []),
            ],
            [{ url: DEFAULT_URL, measuredAt: audit.measuredAt }],
            [audit.discoveryError, ...audit.tools.map((tool) => tool.reason)].filter(
              (value): value is string => value !== null,
            ),
          ),
        );
      }
    } catch (error) {
      checks.push(result(name, [], [], [error instanceof Error ? error.message : "Check unavailable"]));
    }
  }
  const status = statusOf(checks.map((check) => check.status));
  return {
    version: 1,
    evaluatedAt: new Date().toISOString(),
    mode: config.mode,
    status,
    exitCode: status === "fail" ? 1 : status === "incomplete" && config.failOnIncomplete ? 2 : 0,
    requests: budget.requests,
    maxRequests: config.maxRequests,
    durationMs: Math.round(performance.now() - started),
    checks,
  };
}
