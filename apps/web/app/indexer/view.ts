// SPDX-License-Identifier: Apache-2.0
import type { Finding, Snapshot, Status } from "../../../../packages/indexer-audit/src/types";

export type Filter = "ALL" | Status;
const order: Record<Status, number> = { FAIL: 0, UNVERIFIABLE: 1, PASS: 2 };

/** Keep failures first without changing the underlying recorded verdict.
 * @example visibleFindings(report.findings, "FAIL");
 */
export function visibleFindings(findings: Finding[], filter: Filter): Finding[] {
  return findings
    .filter((f) => filter === "ALL" || f.status === filter)
    .toSorted((a, b) => order[a.status] - order[b.status]);
}

/** Show exact stake summands from the same recorded endpoint as the verdict.
 * @example stakeArithmetic(report.snapshot, "miners");
 */
export function stakeArithmetic(snapshot: Snapshot, group: string): string | null {
  try {
    const raw = snapshot.observations.find((o) => o.id === "staking")?.raw;
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !(group in value)) return null;
    const data: unknown = (value as Record<string, unknown>)[group];
    if (!data || typeof data !== "object") return null;
    const fields = data as Record<string, unknown>;
    const parts = [fields.selfStake, fields.delegatedStake, fields.sponsoredStake];
    if (!parts.every((v): v is string => typeof v === "string" && /^\d{1,78}$/.test(v))) return null;
    return `${parts.join(" + ")} = ${parts.reduce((sum, v) => sum + BigInt(v), 0n)} raw planck`;
  } catch {
    return null;
  }
}
