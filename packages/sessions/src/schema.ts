// SPDX-License-Identifier: Apache-2.0
import { parseIndexerData, parseSettlement, type IndexerData, type Settlement } from "@flop-lab/mcp";
export const source = "https://mcp.flop.network/mcp";
export type Kind = "channels" | "settlements" | "offers";
export type Observation = {
  kind: Kind;
  source: string;
  measuredAt: string;
  offset: number;
  raw: string | null;
  error: string | null;
};
export type Capture = {
  version: 1;
  startedAt: string;
  finishedAt: string;
  requests: number;
  durationMs: number;
  observations: Observation[];
};
export type Channel = IndexerData<"computeChannels">["data"][number];
export type Page<T> = { data: T[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } };
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object");
  return v as Record<string, unknown>;
}
export function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Invalid count");
  return v;
}
export function time(v: unknown): string {
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
    throw new Error("Invalid timestamp");
  return v;
}
/** Validate a channel identifier before any query. @example channelId("0x" + "ab".repeat(32)) */
export function channelId(v: unknown): string {
  if (typeof v !== "string" || !/^0x[0-9a-f]{64}$/i.test(v)) throw new Error("Expected a 32-byte channel ID");
  return v.toLowerCase();
}
function pagination(v: unknown, length: number) {
  const p = object(v);
  const result = { total: count(p.total), limit: count(p.limit), offset: count(p.offset), hasMore: p.hasMore };
  if (
    typeof result.hasMore !== "boolean" ||
    result.limit < 1 ||
    result.limit > 100 ||
    length > result.limit ||
    result.offset + length > result.total ||
    result.hasMore !== result.offset + length < result.total
  )
    throw new Error("Inconsistent pagination");
  return { ...result, hasMore: result.hasMore };
}
/** Parse one recorded response using the public MCP schemas. @example parsePage(observation) */
export function parsePage(o: Observation): Page<Channel> | Page<Settlement> | Page<Record<string, unknown>> {
  if (o.raw === null) throw new Error(o.error ?? "No data");
  const raw: unknown = JSON.parse(o.raw);
  let data: (Channel | Settlement | Record<string, unknown>)[];
  let p: unknown;
  if (o.kind === "channels") {
    const value = parseIndexerData("computeChannels", raw);
    data = value.data;
    for (const c of value.data) {
      channelId(c.channelId);
      count(c.openedBlock);
      count(c.openedAt);
      count(c.updatedAt);
      if (c.challengeEnd !== null) count(c.challengeEnd);
      if (c.statusBlockNumber !== null) count(c.statusBlockNumber);
    }
    p = value.pagination;
  } else {
    const value = object(raw);
    if (!Array.isArray(value.data)) throw new Error("Expected response rows");
    data = o.kind === "settlements" ? value.data.map(parseSettlement) : value.data.map(object);
    if (o.kind === "settlements")
      for (const s of data as Settlement[]) {
        channelId(s.channelId);
        count(s.settledBlock);
        count(s.settledAt);
      }
    p = value.pagination;
  }
  const page = { data, pagination: pagination(p, data.length) };
  if (page.pagination.offset !== o.offset) throw new Error("Response offset differs from request");
  return page as Page<Channel> | Page<Settlement> | Page<Record<string, unknown>>;
}
/** Reject malformed captures before classification. @example parseCapture(JSON.parse(raw)) */
export function parseCapture(v: unknown): Capture {
  const c = object(v);
  if (c.version !== 1 || !Array.isArray(c.observations) || c.observations.length > 41)
    throw new Error("Invalid capture");
  const observations = c.observations.map((item): Observation => {
    const o = object(item);
    if (!["channels", "settlements", "offers"].includes(String(o.kind)) || o.source !== source)
      throw new Error("Invalid observation source or kind");
    if (o.raw !== null && (typeof o.raw !== "string" || new TextEncoder().encode(o.raw).length > 190_000))
      throw new Error("Invalid response size");
    if (o.raw === null ? typeof o.error !== "string" : o.error !== null) throw new Error("Invalid observation outcome");
    const result = {
      kind: o.kind as Kind,
      source,
      measuredAt: time(o.measuredAt),
      offset: count(o.offset),
      raw: o.raw as string | null,
      error: o.error as string | null,
    };
    if (result.raw !== null) parsePage(result);
    return result;
  });
  const result = {
    version: 1 as const,
    startedAt: time(c.startedAt),
    finishedAt: time(c.finishedAt),
    requests: count(c.requests),
    durationMs: count(c.durationMs),
    observations,
  };
  if (
    result.finishedAt < result.startedAt ||
    observations.some((o) => o.measuredAt < result.startedAt || o.measuredAt > result.finishedAt)
  )
    throw new Error("Invalid capture time bounds");
  return result;
}
