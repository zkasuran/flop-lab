// SPDX-License-Identifier: Apache-2.0
export const SOURCE = "https://mcp.flop.network/mcp";
export const PROOF_QUERY =
  "query($limit:Int,$offset:Int){pouiProofs(limit:$limit,offset:$offset){id blockHash blockNumber submitter gnWeight successCount taskHash timestamp}}";
export const LEADERBOARD_QUERY = "query($limit:Int){pouiLeaderboard(limit:$limit){submitter totalWeight proofsCount}}";

export type Capture = {
  source: string;
  tool: string;
  args: Record<string, unknown>;
  measuredAt: string;
  raw: string | null;
  error: string | null;
};
export type Recording = {
  version: 1;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  limit: number;
  captures: Capture[];
};
export type Evidence<T> = {
  status: "ok" | "unavailable";
  value: T | null;
  measuredAt: string;
  source: string;
  reason: string | null;
};
export type Proof = {
  id: string;
  blockHash: string | null;
  blockNumber: number | null;
  submitter: string | null;
  gnWeight: number | null;
  successCount: number | null;
  taskHash: string | null;
  timestamp: number | null;
};
export type Leader = { submitter: string; totalWeight: number | null; proofsCount: number | null };
export type Settlement = {
  channelId: string;
  miner: string;
  settledBlock: number;
  settledAt: number;
  modelHash: string | null;
  aggregateGn: string;
};
export type Sample<T> = { rows: T[]; complete: boolean; reportedTotal: number | null };
export type Coverage = {
  channelId: string;
  status: "UNVERIFIABLE";
  code: "PROOFS_UNAVAILABLE" | "NO_OBSERVED_PROOF" | "NO_PUBLIC_BINDING";
  reason: string;
};

/** Validate a plain boundary object. @example object(JSON.parse(raw)) */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
/** Validate bounded nonempty text. @example text(row.id) */
export function text(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 4000) throw new Error("Invalid text");
  return value;
}
/** Validate nonnegative finite observed values. @example number(row.gnWeight) */
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid nonnegative number");
  return value;
}
/** Validate exact counts. @example count(row.proofsCount) */
export function count(value: unknown): number {
  const result = number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Invalid safe count");
  return result;
}
/** Validate canonical capture times. @example time(record.measuredAt) */
export function time(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result)
    throw new Error("Invalid UTC time");
  return result;
}
/** Validate bounded arrays. @example array(response.pouiProofs) */
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Invalid bounded array");
  return value;
}
function nullable<T>(value: unknown, parse: (v: unknown) => T): T | null {
  return value === null ? null : parse(value);
}
function hash(value: unknown): string {
  const result = text(value);
  if (!/^0x[a-fA-F0-9]{64}$/.test(result)) throw new Error("Invalid hash");
  return result;
}
/** Parse only the proof fields exposed by the introspected indexer. @example parseProofs(response) */
export function parseProofs(value: unknown): Proof[] {
  return array(object(value).pouiProofs).map((v) => {
    const p = object(v);
    return {
      id: text(p.id),
      blockHash: nullable(p.blockHash, hash),
      blockNumber: nullable(p.blockNumber, count),
      submitter: nullable(p.submitter, text),
      gnWeight: nullable(p.gnWeight, number),
      successCount: nullable(p.successCount, count),
      taskHash: nullable(p.taskHash, hash),
      timestamp: nullable(p.timestamp, count),
    };
  });
}
/** Parse both public leaderboard projections. These are not independent verifiers. @example parseLeaderboard(response) */
export function parseLeaderboard(value: unknown): Leader[] {
  const rows = array(object(value).pouiLeaderboard).map((v) => {
    const p = object(v);
    return {
      submitter: text(p.submitter),
      totalWeight: nullable(p.totalWeight, number),
      proofsCount: nullable(p.proofsCount, count),
    };
  });
  if (new Set(rows.map((r) => r.submitter)).size !== rows.length) throw new Error("Duplicate leaderboard submitter");
  return rows;
}
/** Parse settlement identifiers and reported paging without lossy G_n arithmetic. @example parseSettlements(response) */
export function parseSettlements(value: unknown) {
  const o = object(value),
    p = object(o.pagination);
  const rows: Settlement[] = array(o.data).map((v) => {
    const s = object(v),
      aggregateGn = text(s.aggregateGn);
    if (!/^\d+$/.test(aggregateGn)) throw new Error("Invalid aggregateGn");
    return {
      channelId: hash(s.channelId),
      miner: text(s.miner),
      settledBlock: count(s.settledBlock),
      settledAt: count(s.settledAt),
      modelHash: nullable(s.modelHash, hash),
      aggregateGn,
    };
  });
  if (typeof p.hasMore !== "boolean") throw new Error("Invalid hasMore");
  const total = count(p.total),
    limit = count(p.limit),
    offset = count(p.offset);
  if (!limit || rows.length > limit || offset + rows.length > total || p.hasMore !== offset + rows.length < total)
    throw new Error("Inconsistent settlement pagination");
  return { rows, total, limit, offset, hasMore: p.hasMore };
}
/** Parse a captured raw tool response. Failed calls carry no invented data. @example parseCapture(value) */
export function parseCapture(value: unknown): Capture {
  const c = object(value);
  if (c.source !== SOURCE) throw new Error("Unsupported capture source");
  const tool = text(c.tool);
  if (!["flop_indexer_query", "flop_get_stats", "flop_get_poui_leaderboard", "flop_list_settlements"].includes(tool))
    throw new Error("Unsupported tool");
  if (c.raw !== null && (typeof c.raw !== "string" || c.raw.length > 200_000)) throw new Error("Invalid raw response");
  if ((c.raw === null) === (c.error === null)) throw new Error("Capture must contain data or an error");
  return {
    source: SOURCE,
    tool,
    args: object(c.args),
    measuredAt: time(c.measuredAt),
    raw: c.raw as string | null,
    error: c.error === null ? null : text(c.error),
  };
}
/** Validate a replay file before analysis. @example parseRecording(JSON.parse(raw)) */
export function parseRecording(value: unknown): Recording {
  const r = object(value);
  if (r.version !== 1) throw new Error("Unsupported recording version");
  const startedAt = time(r.startedAt),
    finishedAt = time(r.finishedAt),
    limit = count(r.limit);
  if (startedAt > finishedAt || limit < 1 || limit > 1000) throw new Error("Invalid recording bounds");
  const captures = array(r.captures).map(parseCapture);
  if (captures.length > 24 || captures.some((c) => c.measuredAt < startedAt || c.measuredAt > finishedAt))
    throw new Error("Capture outside recording bounds");
  return {
    version: 1,
    startedAt,
    finishedAt,
    durationMs: number(r.durationMs),
    requests: count(r.requests),
    limit,
    captures,
  };
}
