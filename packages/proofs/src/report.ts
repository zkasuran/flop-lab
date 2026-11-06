// SPDX-License-Identifier: Apache-2.0
import {
  count,
  LEADERBOARD_QUERY,
  object,
  parseLeaderboard,
  parseProofs,
  parseRecording,
  parseSettlements,
  PROOF_QUERY,
  SOURCE,
  type Capture,
  type Coverage,
  type Evidence,
  type Proof,
  type Sample,
  type Settlement,
} from "./model";

function decode<T>(capture: Capture, parse: (v: unknown) => T): Evidence<T> {
  const base = { measuredAt: capture.measuredAt, source: `${capture.source}#${capture.tool}` };
  try {
    if (capture.raw === null) throw new Error(capture.error ?? "Source unavailable");
    return { ...base, status: "ok", value: parse(JSON.parse(capture.raw)), reason: null };
  } catch (error) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
function missing<T>(at: string): Evidence<T> {
  return { status: "unavailable", value: null, measuredAt: at, source: SOURCE, reason: "Source not captured" };
}

/** Public PoUI rows cannot establish paid-channel coverage. Coincident IDs or miners do not supply a binding.
 * @example coverageFor(settlement, report.proofs)
 */
export function coverageFor(settlement: Settlement, proofs: Evidence<Sample<Proof>>): Coverage {
  if (proofs.status !== "ok" || !proofs.value)
    return {
      channelId: settlement.channelId,
      status: "UNVERIFIABLE",
      code: "PROOFS_UNAVAILABLE",
      reason: "Proof source unavailable. No settlement coverage can be checked.",
    };
  if (proofs.value.rows.length === 0)
    return {
      channelId: settlement.channelId,
      status: "UNVERIFIABLE",
      code: "NO_OBSERVED_PROOF",
      reason:
        "No proof rows in this observation. The public schema exposes no channel-to-task binding, TOPLOC commitment or proof payload. Empty direct-rail data does not prove missing channel evidence.",
    };
  return {
    channelId: settlement.channelId,
    status: "UNVERIFIABLE",
    code: "NO_PUBLIC_BINDING",
    reason:
      "Public proof rows expose taskHash and submitter but no channel binding, measured model/output binding, TOPLOC commitment or validator bundle. Direct-rail credit is separate from paid-channel settlement (section 3.6).",
  };
}

/** Analyze independent dated captures. A malformed page invalidates that source rather than becoming an empty sample.
 * @example analyzeRecording(recording).coverage
 */
export function analyzeRecording(input: unknown) {
  const recording = parseRecording(input);
  const find = (tool: string, query?: string) =>
    recording.captures.filter((c) => c.tool === tool && (query === undefined || c.args.query === query));
  const one = <T>(captures: Capture[], parse: (v: unknown) => T): Evidence<T> =>
    captures[0] ? decode(captures[0], parse) : missing<T>(recording.finishedAt);
  let proofs: Evidence<Sample<Proof>> = missing(recording.finishedAt);
  let settlements: Evidence<Sample<Settlement>> = missing(recording.finishedAt);
  const proofPages = find("flop_indexer_query", PROOF_QUERY);
  if (proofPages.length) {
    const rows: Proof[] = [];
    proofs = { ...missing(recording.finishedAt), status: "ok", reason: null };
    let complete = false;
    for (const capture of proofPages) {
      const page = decode(capture, parseProofs);
      try {
        if (page.value === null) throw new Error(page.reason ?? "Proof page unavailable");
        const vars = object(capture.args.variables),
          limit = count(vars.limit);
        if (complete || !limit || count(vars.offset) !== rows.length || page.value.length > limit)
          throw new Error("Inconsistent proof pagination");
        complete = page.value.length < limit;
        rows.push(...page.value);
        if (rows.length > recording.limit) throw new Error("Proof rows exceed the recording limit");
        if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error("Duplicate proof id across pages");
        proofs = { ...page, value: { rows, complete, reportedTotal: null } };
      } catch (error) {
        proofs = { ...page, status: "unavailable", value: null, reason: String(error) };
        break;
      }
    }
  }
  const settlementPages = find("flop_list_settlements");
  if (settlementPages.length) {
    const rows: Settlement[] = [];
    let total: number | null = null,
      complete = false;
    for (const capture of settlementPages) {
      const page = decode(capture, parseSettlements);
      try {
        if (!page.value) throw new Error(page.reason ?? "Settlement page unavailable");
        const p = page.value;
        if (
          complete ||
          p.offset !== rows.length ||
          p.offset !== capture.args.offset ||
          p.limit !== capture.args.limit ||
          (total !== null && p.total !== total) ||
          (p.hasMore && !p.rows.length)
        )
          throw new Error("Settlement pages changed or did not advance");
        total = p.total;
        complete = !p.hasMore;
        rows.push(...p.rows);
        if (rows.length > recording.limit) throw new Error("Settlement rows exceed the recording limit");
        if (new Set(rows.map((r) => r.channelId)).size !== rows.length) throw new Error("Duplicate settlement channel");
        settlements = { ...page, value: { rows, complete, reportedTotal: total } };
      } catch (error) {
        settlements = { ...page, status: "unavailable", value: null, reason: String(error) };
        break;
      }
    }
  }
  const stats = one(find("flop_get_stats"), (v) => {
    const s = object(object(v).stats);
    return {
      proofs24h: s.proofs24h === null ? null : count(s.proofs24h),
      latestBlockNumber: count(s.latestBlockNumber),
    };
  });
  const leaderboard = one(find("flop_get_poui_leaderboard"), parseLeaderboard);
  const indexerLeaderboard = one(find("flop_indexer_query", LEADERBOARD_QUERY), parseLeaderboard);
  return {
    mode: "recorded" as "recorded" | "live",
    recording,
    proofs,
    settlements,
    stats,
    leaderboard,
    indexerLeaderboard,
    coverage: (settlements.value?.rows ?? []).map((s) => coverageFor(s, proofs)),
    limits:
      "Sequential public indexer observations. Completion means reported pagination only, not atomic chain state. No cryptographic proof verification or current network claim.",
  };
}
export type ProofReport = ReturnType<typeof analyzeRecording>;
