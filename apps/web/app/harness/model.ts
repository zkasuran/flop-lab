// SPDX-License-Identifier: Apache-2.0
import type { ClaimResult, RunReport, Status } from "../../../../packages/harness/src/types";

export type { ClaimResult, RunReport };
export const statuses = ["PASS", "FAIL", "UNVERIFIABLE", "SKIPPED"] as const;
export type Filter = Status | "ALL" | "FLAKY";

/** Count recorded outcomes without treating unavailable checks as passes. @example counts(report.results).FAIL */
export function counts(results: ClaimResult[]): Record<Status | "FLAKY", number> {
  const total = { PASS: 0, FAIL: 0, UNVERIFIABLE: 0, SKIPPED: 0, FLAKY: 0 };
  for (const result of results) {
    total[result.status]++;
    if (result.flaky) total.FLAKY++;
  }
  return total;
}

/** Keep catalogue order while matching status, boundary and text. @example filterResults(results, "FAIL", "all", "schema") */
export function filterResults(results: ClaimResult[], status: Filter, kind: string, query: string): ClaimResult[] {
  const needle = query.trim().toLowerCase();
  return results.filter(
    (result) =>
      (status === "ALL" || (status === "FLAKY" ? result.flaky : result.status === status)) &&
      (kind === "all" || result.claim.kind === kind) &&
      `${result.claim.id} ${result.claim.title} ${result.claim.expected} ${result.reason}`
        .toLowerCase()
        .includes(needle),
  );
}

/** Use the workspace entry point after checkout rather than an unpublished binary. @example reproduceCommand("gateway-contract") */
export function reproduceCommand(id: string): string {
  if (!/^[a-z][a-z0-9-]+$/.test(id)) throw new Error("Invalid claim id");
  return `pnpm --filter @flop-lab/harness start run --only ${id} --max-requests 100 --max-flop 0`;
}

/** Keep evidence excerpts readable without discarding the raw fixture reference. @example excerpt({ok: true}) */
export function excerpt(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "excerpt" in value &&
    "truncated" in value &&
    value.truncated === true &&
    typeof value.excerpt === "string"
  ) {
    return `${value.excerpt}\n\n[Truncated recorded excerpt]`;
  }
  return JSON.stringify(value, null, 2) ?? "No observation recorded";
}

/** Format a recording in UTC identically on server and browser. @example utc("2026-11-05T09:23:47.131Z") */
export function utc(value: string): string {
  return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
}
