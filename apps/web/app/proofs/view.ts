// SPDX-License-Identifier: Apache-2.0
import type { ProofReport } from "../../../../packages/proofs/src/report";

/** Build a compact browser view while retaining source-specific observation times.
 * @example proofView(recordedProofs()).settlements
 */
export function proofView(report: ProofReport) {
  const reasons = Object.fromEntries(report.coverage.map((c) => [c.code, c.reason]));
  const coverage = new Map(report.coverage.map((c) => [c.channelId, c]));
  return {
    measuredAt: report.recording.finishedAt,
    startedAt: report.recording.startedAt,
    proofs: report.proofs,
    stats: report.stats,
    leaderboard: report.leaderboard,
    indexerLeaderboard: report.indexerLeaderboard,
    settlements: {
      ...report.settlements,
      value: report.settlements.value
        ? {
            ...report.settlements.value,
            rows: report.settlements.value.rows.map((s) => {
              const c = coverage.get(s.channelId);
              if (!c) throw new Error("Missing settlement coverage result");
              return { ...s, status: c.status, code: c.code };
            }),
          }
        : null,
    },
    reasons,
    limits: report.limits,
  };
}
export type ProofView = ReturnType<typeof proofView>;

/** Filter only recorded identifiers and sort by the recorded settlement event time.
 * @example selectSettlements(view, "0xabc", "newest")
 */
export function selectSettlements(view: ProofView, query: string, order: "newest" | "oldest") {
  const search = query.trim().toLowerCase();
  return (view.settlements.value?.rows ?? [])
    .filter((s) => `${s.channelId} ${s.miner}`.toLowerCase().includes(search))
    .sort((a, b) => (order === "newest" ? b.settledAt - a.settledAt : a.settledAt - b.settledAt));
}
